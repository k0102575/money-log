import { test } from "node:test";
import assert from "node:assert/strict";
import { testDb } from "./db-adapter.ts";
import {
  createAccount,
  detail,
  getAccount,
  saveMoney,
  saveProduct,
  snapshot,
  updateAccount,
  draftReport,
  readReport,
  finalizeReport,
} from "../app/lib/db.server.ts";
import { current, money, quantity, today } from "../app/lib/domain.ts";
import { makeMarkdown } from "../app/lib/report.ts";
import { verifyPassword } from "../app/lib/crypto.ts";
import { pbkdf2Sync } from "node:crypto";
function form(values: Record<string, unknown>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, String(v));
  return f;
}
const base = {
  alias: "가상계좌",
  institution: "테스트기관",
  account_type: "checking",
  tracking_start_date: "2026-01-01",
};
const evidence = { source: "app", precision: "exact" };
test("금액 미확인·0, 정수 범위와 소수 수량을 구분한다", () => {
  assert.equal(money(""), null);
  assert.equal(money("0"), 0);
  assert.equal(money("1,000"), 1000);
  for (const v of ["1.5", "-1", "1e3", "12,34", "9007199254740992"])
    assert.throws(() => money(v));
  assert.equal(quantity("0001.23000000"), "1.23");
  assert.equal(quantity("0.00000001"), "0.00000001");
  assert.throws(() => quantity("1.000000001"));
  assert.throws(() => quantity("-1"));
});
test("8개 계좌·상품 수량과 IRP 분류를 보존하고 MD에 모두 출력한다", async () => {
  const t = testDb();
  try {
    for (const [alias, type] of [
      ["테스트 하나", "checking"],
      ["테스트 신한", "checking"],
      ["테스트 CMA", "cma"],
      ["테스트 ISA", "isa"],
      ["테스트 IRP", "irp"],
      ["테스트 연금", "pension"],
      ["테스트 적금", "savings"],
      ["테스트 청약", "housing"],
    ])
      await createAccount(t.db, form({ ...base, alias, account_type: type }));
    const s = await snapshot(t.db, today());
    assert.equal(s.accounts.length, 8);
    const irp = s.accounts.find((a) => a.account_type === "irp")!;
    await saveProduct(
      t.db,
      irp,
      form({
        version: irp.version,
        name: "테스트 위험 상품",
        quantity: "1.25",
        as_of_date: "2026-02-01",
        risk_class: "risk",
      }),
    );
    const md = makeMarkdown(await snapshot(t.db, today()));
    for (const a of s.accounts) assert.ok(md.includes(a.alias));
    assert.ok(md.includes("1.25"));
    assert.ok(md.includes("위험자산"));
    assert.ok(!md.includes("## 부채"));
    const d = await detail(t.db, irp.id);
    assert.equal(d.quantities[0].quantity_decimal, "1.25");
  } finally {
    t.close();
  }
});
test("계좌 납입·인출과 평가액을 구분하고 같은 날짜 초기 기록을 원자적으로 정정한다", async () => {
  const t = testDb();
  try {
    const id = await createAccount(
      t.db,
      form({ ...base, account_type: "irp" }),
    );
    let a = await getAccount(t.db, id);
    await saveMoney(
      t.db,
      a,
      form({
        ...evidence,
        version: a.version,
        metric: "initial",
        initial_contributions: "1000000",
        initial_withdrawals: "",
      }),
    );
    let md = makeMarkdown(await snapshot(t.db, today()));
    assert.ok(md.includes("초기 총 인출: 미확인"));
    assert.ok(md.includes("초기 순납입: 계산하지 않음"));
    a = await getAccount(t.db, id);
    await saveMoney(
      t.db,
      a,
      form({
        ...evidence,
        version: a.version,
        mode: "correct",
        reason: "인출 없음 확인",
        metric: "initial",
        initial_contributions: "1000000",
        initial_withdrawals: "0",
      }),
    );
    md = makeMarkdown(await snapshot(t.db, today()));
    assert.ok(md.includes("초기 순납입: 1,000,000원"));
    assert.ok(md.includes("계좌 전체 평가액: 미확인"));
    const d = await detail(t.db, id);
    assert.equal(d.observations.length, 3);
    assert.equal(d.observations.filter((o) => !o.superseded_by).length, 2);
  } finally {
    t.close();
  }
});
test("과거 기준일·오입력 정정·동시 수정 충돌을 처리하고 실패를 롤백한다", async () => {
  const t = testDb();
  try {
    const id = await createAccount(t.db, form(base));
    let a = await getAccount(t.db, id);
    await saveMoney(
      t.db,
      a,
      form({
        ...evidence,
        version: a.version,
        metric: "cash_balance",
        amount: "100",
        as_of_date: "2026-02-01",
      }),
    );
    a = await getAccount(t.db, id);
    await saveMoney(
      t.db,
      a,
      form({
        ...evidence,
        version: a.version,
        metric: "cash_balance",
        amount: "200",
        as_of_date: "2026-03-01",
      }),
    );
    await assert.rejects(() =>
      saveMoney(
        t.db,
        a,
        form({
          ...evidence,
          version: a.version,
          metric: "cash_balance",
          amount: "999",
          as_of_date: "2026-04-01",
        }),
      ),
    );
    a = await getAccount(t.db, id);
    await assert.rejects(() =>
      saveMoney(
        t.db,
        a,
        form({
          ...evidence,
          version: a.version,
          metric: "cash_balance",
          amount: "999",
          as_of_date: "2026-03-01",
        }),
      ),
    );
    assert.equal((await getAccount(t.db, id)).version, a.version);
    let d = await detail(t.db, id);
    const old = d.observations.find((o) => o.amount_krw === 100)!;
    await saveMoney(
      t.db,
      a,
      form({
        ...evidence,
        version: a.version,
        metric: "cash_balance",
        mode: "correct",
        reason: "오타 정정",
        observation_id: old.id,
        amount: "150",
        as_of_date: "2026-02-01",
      }),
    );
    d = await detail(t.db, id);
    assert.equal(current(d.observations, "2026-02-20")?.amount_krw, 150);
    assert.equal(current(d.observations, "2026-03-01")?.amount_krw, 200);
    assert.equal(d.observations.length, 3);
    assert.ok(
      !makeMarkdown(await snapshot(t.db, "2025-12-31")).includes(
        "### 가상계좌",
      ),
    );
  } finally {
    t.close();
  }
});
test("일반 투자계좌는 IRP 분류를 저장하지 않고 수량 0은 보유 목록에서 제외한다", async () => {
  const t = testDb();
  try {
    const id = await createAccount(
      t.db,
      form({ ...base, account_type: "isa" }),
    );
    let a = await getAccount(t.db, id);
    await saveProduct(
      t.db,
      a,
      form({
        version: a.version,
        name: "가상 ETF",
        quantity: "2",
        as_of_date: "2026-02-01",
        risk_class: "risk",
      }),
    );
    let d = await detail(t.db, id);
    assert.equal(d.quantities[0].risk_class, null);
    a = await getAccount(t.db, id);
    await saveProduct(
      t.db,
      a,
      form({
        version: a.version,
        product_id: d.products[0].id,
        name: "가상 ETF",
        quantity: "0",
        as_of_date: "2026-03-01",
      }),
    );
    let md = makeMarkdown(await snapshot(t.db, "2026-02-01"));
    assert.ok(md.includes("가상 ETF"));
    md = makeMarkdown(await snapshot(t.db, "2026-03-01"));
    assert.ok(!md.includes("| 가상 ETF"));
    assert.ok(!md.includes("| IRP 분류 |"));
  } finally {
    t.close();
  }
});
test("MD 미리보기를 고정하고 중복 확정·세션 만료·과거 보고서를 처리한다", async () => {
  const t = testDb();
  try {
    t.sql
      .prepare(
        "INSERT INTO sessions VALUES('session','hash','csrf','2999-01-01','1','2026-01-01')",
      )
      .run();
    const accountId = await createAccount(t.db, form(base));
    const id = await draftReport(t.db, today(), "session", "unique-key");
    assert.equal(await draftReport(t.db, today(), "session", "unique-key"), id);
    const before = await readReport(t.db, id, "session");
    await assert.rejects(() => readReport(t.db, id, "other-session"));
    let a = await getAccount(t.db, accountId);
    await updateAccount(
      t.db,
      a,
      form({ ...base, version: a.version, alias: "변경된 이름" }),
    );
    await finalizeReport(t.db, id, "session");
    await finalizeReport(t.db, id, "session");
    const after = await readReport(t.db, id, "new-session");
    assert.equal(before.markdown, after.markdown);
    assert.equal(after.status, "saved");
    assert.ok(!after.markdown.includes("변경된 이름"));
    const expired = await draftReport(t.db, today(), "session", "expired-key");
    t.sql
      .prepare("UPDATE reports SET draft_expires_at='2000-01-01' WHERE id=?")
      .run(expired);
    await assert.rejects(() => readReport(t.db, expired, "session"));
  } finally {
    t.close();
  }
});
test("비밀번호 해시는 정확한 비밀번호만 인증한다", async () => {
  const salt = "00112233445566778899aabbccddeeff";
  const password = "local-test-password-1234";
  const hash = pbkdf2Sync(
    password,
    Buffer.from(salt, "hex"),
    100000,
    32,
    "sha256",
  ).toString("hex");
  const encoded = `pbkdf2-sha256$100000$${salt}$${hash}`;
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong", encoded), false);
  await assert.rejects(() => verifyPassword(password, "invalid"));
});

test("로그아웃·만료 세션을 삭제해도 확정 보고서와 원문이 보존된다", async () => {
  const t = testDb();
  try {
    t.sql
      .prepare(
        "INSERT INTO sessions VALUES('owner','token','csrf','2999-01-01','1','2026-01-01')",
      )
      .run();
    const draft = await draftReport(t.db, today(), "owner", "logout-draft");
    const saved = await draftReport(t.db, today(), "owner", "logout-saved");
    await finalizeReport(t.db, saved, "owner");
    const before = await readReport(t.db, saved, "owner");
    t.sql.prepare("DELETE FROM sessions WHERE id='owner'").run();
    assert.equal(
      (await readReport(t.db, saved, "next-login")).markdown,
      before.markdown,
    );
    await assert.rejects(() => readReport(t.db, draft, "next-login"));
  } finally {
    t.close();
  }
});
