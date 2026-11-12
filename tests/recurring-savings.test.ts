import assert from "node:assert/strict";
import { test } from "node:test";
import {
  projectSavings,
  savingsPageData,
  manageSavingsRule,
  confirmSavings,
  listSavingsRules,
  plannedSavings,
  saveSavingsRule,
} from "../app/lib/recurring-savings.server.ts";
import { savingsDueDate } from "../app/lib/recurring-savings.ts";
import { testDb } from "./db-adapter.ts";

function fields(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

test("반복 납입은 적용 월과 만기를 지키고 실제 저축 이체를 한 번만 기록한다", async (t) => {
  const { db, sql, close } = testDb();
  t.after(close);
  sql.exec(`
    INSERT INTO accounts(id,alias,institution,account_type,tracking_start_date,created_at,updated_at)
    VALUES ('hana','하나','하나','checking','2026-11-01','',''),
           ('youth','도약','하나','savings','2026-11-01','',''),
           ('housing','청약','하나','housing','2026-11-01','','')
  `);
  const initial = {
    account_id: "hana",
    destination_id: "youth",
    effective_month: "2026-11",
    payment_day: "26",
    amount: "700,000",
    ends_on: "2029-03-25",
  };
  await saveSavingsRule(db, fields(initial));
  await saveSavingsRule(
    db,
    fields({
      ...initial,
      destination_id: "housing",
      amount: "100,000",
      ends_on: "",
    }),
  );
  const plans = async (month: string) =>
    plannedSavings(db, await listSavingsRules(db), month);
  assert.deepEqual(await plans("2026-10"), []);
  const youth = (await plans("2026-11")).find(
    ({ rule }) => rule.destination_id === "youth",
  )!;
  assert.equal(youth.due, "2026-11-26");
  assert.equal(
    savingsDueDate({ ...youth.rule, payment_day: 31 }, "2028-02"),
    "2028-02-29",
  );
  assert.equal(
    sql.prepare("SELECT COUNT(*) AS count FROM ledger_transactions").get()
      ?.count,
    0,
  );

  const confirmation = fields({
    destination_id: "youth",
    rule: JSON.stringify(youth.rule),
    occurred_on: "2026-11-01",
    amount: "690,000",
  });
  await Promise.all([
    confirmSavings(db, confirmation, "2026-11"),
    confirmSavings(db, confirmation, "2026-11"),
  ]);
  sql.exec(
    "INSERT INTO ledger_transactions(id,occurred_on,kind,amount_krw,account_id,destination_id,category) VALUES ('manual','2026-11-01','transfer',100000,'hana','housing','saving')",
  );
  const housing = (await plans("2026-11")).find(
    ({ rule }) => rule.destination_id === "housing",
  )!;
  await assert.rejects(
    confirmSavings(
      db,
      fields({
        destination_id: "housing",
        rule: JSON.stringify(housing.rule),
        occurred_on: "2026-11-01",
        amount: "100000",
      }),
      "2026-11",
    ),
    /이미 같은/,
  );
  sql.exec("DELETE FROM ledger_transactions WHERE id='manual'");
  await saveSavingsRule(
    db,
    fields({ ...initial, effective_month: "2026-12", amount: "650,000" }),
  );
  assert.deepEqual(
    sql
      .prepare(
        "SELECT kind, category, amount_krw, account_id, destination_id FROM ledger_transactions",
      )
      .all()
      .map((row) => ({ ...row })),
    [
      {
        kind: "transfer",
        category: "saving",
        amount_krw: 690000,
        account_id: "hana",
        destination_id: "youth",
      },
    ],
  );
  assert.equal(
    (await plans("2026-11")).find(({ rule }) => rule.destination_id === "youth")
      ?.transaction?.amount_krw,
    690000,
  );
  assert.equal(
    (await plans("2026-12")).find(({ rule }) => rule.destination_id === "youth")
      ?.rule.amount_krw,
    650000,
  );
  assert.equal((await plans("2029-02")).length, 2);
  assert.deepEqual(
    (await plans("2029-03")).map(({ rule }) => rule.destination_id),
    ["housing"],
  );
  await assert.rejects(
    manageSavingsRule(
      db,
      fields({
        intent: "delete-savings",
        destination_id: "youth",
      }),
    ),
    /확정한 납입/,
  );
  const page = await savingsPageData(db, "2026-11", true);
  assert.equal(page.rows.length, 1);
  assert.deepEqual(page.plans, await plans("2026-11"));
  assert.deepEqual(
    projectSavings(page.rules, "2026-11", page.rows),
    page.plans,
  );
  const pendingOnly = await savingsPageData(db, "2026-11");
  assert.equal(pendingOnly.rows.length, 0);
  assert.deepEqual(pendingOnly.plans, page.plans);
  const stopMonth = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
  await manageSavingsRule(
    db,
    fields({
      intent: "stop-savings",
      destination_id: "youth",
      stop_month: stopMonth,
    }),
  );
  assert.equal(
    (await plans(stopMonth)).some(
      ({ rule, transaction }) =>
        rule.destination_id === "youth" && !transaction,
    ),
    false,
  );
  assert.equal(
    sql.prepare("SELECT COUNT(*) AS count FROM ledger_transactions").get()
      ?.count,
    1,
  );
  await manageSavingsRule(
    db,
    fields({ intent: "delete-savings", destination_id: "housing" }),
  );
  assert.equal(
    (await listSavingsRules(db)).some(
      (rule) => rule.destination_id === "housing",
    ),
    false,
  );
});
