import {
  accountTypes,
  choice,
  ConflictError,
  dateValue,
  InputError,
  isInvestment,
  money,
  precisions,
  quantity,
  risks,
  sources,
  textValue,
  today,
} from "./domain.ts";
import type {
  Account,
  Observation,
  Product,
  ProductObservation,
  Snapshot,
  Metric,
} from "./domain.ts";
import { makeMarkdown } from "./report.ts";
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export async function getAccount(db: D1Database, accountId: string) {
  const a = await db
    .prepare("SELECT * FROM accounts WHERE id=?")
    .bind(accountId)
    .first<Account>();
  if (!a) throw new Response("계좌를 찾을 수 없습니다.", { status: 404 });
  return a;
}
export async function listAccounts(db: D1Database) {
  return (
    await db
      .prepare(
        "SELECT * FROM accounts ORDER BY archived_at IS NOT NULL, created_at, id",
      )
      .all<Account>()
  ).results;
}
export async function detail(db: D1Database, accountId: string) {
  const account = await getAccount(db, accountId);
  const results = await db.batch([
    db
      .prepare(
        "SELECT * FROM account_observations WHERE account_id=? ORDER BY as_of_date DESC, recorded_at DESC",
      )
      .bind(accountId),
    db
      .prepare(
        "SELECT * FROM investment_products WHERE account_id=? ORDER BY created_at,id",
      )
      .bind(accountId),
    db
      .prepare(
        "SELECT q.* FROM product_observations q JOIN investment_products p ON q.product_id=p.id WHERE p.account_id=? ORDER BY q.as_of_date DESC,q.recorded_at DESC",
      )
      .bind(accountId),
  ]);
  return {
    account,
    observations: results[0].results as unknown as Observation[],
    products: results[1].results as unknown as Product[],
    quantities: results[2].results as unknown as ProductObservation[],
  };
}
export async function snapshot(
  db: D1Database,
  asOf: string,
): Promise<Snapshot> {
  dateValue(asOf);
  const result = await db.batch([
    db.prepare("SELECT * FROM accounts ORDER BY created_at,id"),
    db.prepare("SELECT * FROM account_observations"),
    db.prepare("SELECT * FROM investment_products ORDER BY created_at,id"),
    db.prepare("SELECT * FROM product_observations"),
  ]);
  return {
    asOf,
    generatedAt: now(),
    accounts: result[0].results as unknown as Account[],
    observations: result[1].results as unknown as Observation[],
    products: result[2].results as unknown as Product[],
    quantities: result[3].results as unknown as ProductObservation[],
  };
}
function guard(db: D1Database, a: Account, form: FormData) {
  const version = Number(textValue(form, "version", true));
  if (!Number.isSafeInteger(version) || version !== a.version)
    throw new ConflictError(
      "다른 화면에서 변경된 계좌입니다. 새로고침 후 다시 확인해 주세요. 입력 내용은 아래에 유지됩니다.",
    );
  return db
    .prepare(
      "UPDATE accounts SET version=CASE WHEN version=? THEN version+1 ELSE 0 END,updated_at=? WHERE id=?",
    )
    .bind(version, now(), a.id);
}
async function commit(db: D1Database, statements: D1PreparedStatement[]) {
  try {
    await db.batch(statements);
  } catch (e) {
    if (String(e).includes("CHECK constraint failed: version"))
      throw new ConflictError(
        "다른 기기에서 변경되었습니다. 새로고침 후 다시 확인해 주세요.",
      );
    if (String(e).includes("UNIQUE constraint failed"))
      throw new ConflictError(
        "같은 날짜의 기록이 이미 있습니다. 해당 기록을 정정하거나 날짜를 바꿔 주세요.",
      );
    throw e;
  }
}
export async function createAccount(db: D1Database, form: FormData) {
  const alias = textValue(form, "alias", true, 80),
    institution = textValue(form, "institution", true, 80),
    type = choice(textValue(form, "account_type"), accountTypes),
    start = dateValue(textValue(form, "tracking_start_date"));
  const accountId = id(),
    time = now();
  await db
    .prepare(
      "INSERT INTO accounts(id,alias,institution,account_type,tracking_start_date,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .bind(
      accountId,
      alias,
      institution,
      type,
      start,
      textValue(form, "note"),
      time,
      time,
    )
    .run();
  return accountId;
}
export async function updateAccount(
  db: D1Database,
  a: Account,
  form: FormData,
) {
  const alias = textValue(form, "alias", true, 80),
    institution = textValue(form, "institution", true, 80),
    type = choice(textValue(form, "account_type"), accountTypes),
    start = dateValue(textValue(form, "tracking_start_date")),
    note = textValue(form, "note");
  if (type !== a.account_type || start !== a.tracking_start_date) {
    const count = await db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM account_observations WHERE account_id=?) + (SELECT COUNT(*) FROM investment_products WHERE account_id=?) AS n",
      )
      .bind(a.id, a.id)
      .first<{ n: number }>();
    if (count?.n)
      throw new InputError(
        "금액·상품이 등록된 계좌의 유형과 시작일은 변경할 수 없습니다. 잘못 등록했다면 새 계좌를 만들어 주세요.",
      );
  }
  await commit(db, [
    guard(db, a, form),
    db
      .prepare(
        "UPDATE accounts SET alias=?,institution=?,account_type=?,tracking_start_date=?,note=? WHERE id=?",
      )
      .bind(alias, institution, type, start, note, a.id),
  ]);
}
export async function archiveAccount(
  db: D1Database,
  a: Account,
  form: FormData,
) {
  await commit(db, [
    guard(db, a, form),
    db
      .prepare("UPDATE accounts SET archived_at=? WHERE id=?")
      .bind(a.archived_at ? null : now(), a.id),
  ]);
}
function evidence(form: FormData) {
  const source = choice(textValue(form, "source"), sources),
    precision = choice(textValue(form, "precision"), precisions),
    unit = textValue(form, "rounding_unit", precision === "rounded", 40),
    note = textValue(form, "source_note");
  return { source, precision, unit: precision === "rounded" ? unit : "", note };
}
function obsInsert(
  db: D1Database,
  accountId: string,
  metric: Metric,
  amount: number,
  date: string,
  ev: ReturnType<typeof evidence>,
  newId: string,
  old?: Observation,
  reason = "",
) {
  return db
    .prepare(
      "INSERT INTO account_observations(id,account_id,metric,amount_krw,as_of_date,source,source_note,precision,rounding_unit,revision_of,correction_reason,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      newId,
      accountId,
      metric,
      amount,
      date,
      ev.source,
      ev.note,
      ev.precision,
      ev.unit,
      old?.id ?? null,
      reason,
      now(),
    );
}
export async function saveMoney(db: D1Database, a: Account, form: FormData) {
  if (a.archived_at) throw new InputError("보관된 계좌를 먼저 복원해 주세요.");
  const mode = textValue(form, "mode"),
    ev = evidence(form),
    reason = textValue(form, "reason", mode === "correct");
  const statements = [guard(db, a, form)];
  if (textValue(form, "metric") === "initial") {
    if (!isInvestment(a.account_type))
      throw new InputError("투자계좌에서만 초기 납입을 입력할 수 있습니다.");
    const date = a.tracking_start_date;
    const rows = (
      await db
        .prepare(
          "SELECT * FROM account_observations WHERE account_id=? AND metric IN ('initial_contributions','initial_withdrawals') AND superseded_by IS NULL",
        )
        .bind(a.id)
        .all<Observation>()
    ).results;
    if (rows.length && mode !== "correct")
      throw new InputError("초기 누적 기록이 있습니다. 정정을 선택해 주세요.");
    const amounts = [
      money(textValue(form, "initial_contributions")),
      money(textValue(form, "initial_withdrawals")),
    ];
    if (amounts.every((n) => n === null))
      throw new InputError("납입 또는 인출 중 알고 있는 금액을 입력해 주세요.");
    for (const [i, metric] of (
      ["initial_contributions", "initial_withdrawals"] as const
    ).entries()) {
      const old = rows.find((r) => r.metric === metric),
        newId = id();
      if (old)
        statements.push(
          db
            .prepare(
              "UPDATE account_observations SET superseded_by=? WHERE id=? AND superseded_by IS NULL",
            )
            .bind(newId, old.id),
        );
      if (amounts[i] !== null)
        statements.push(
          obsInsert(
            db,
            a.id,
            metric,
            amounts[i]!,
            date,
            ev,
            newId,
            old,
            reason,
          ),
        );
    }
  } else {
    const metric = choice(textValue(form, "metric"), {
      valuation: 1,
      cash_balance: 1,
    }) as Metric;
    if (
      metric !== (isInvestment(a.account_type) ? "valuation" : "cash_balance")
    )
      throw new InputError("이 계좌에서 사용할 수 없는 금액 종류입니다.");
    const date = dateValue(
        textValue(form, "as_of_date"),
        a.tracking_start_date,
      ),
      amount = money(textValue(form, "amount"));
    if (amount === null)
      throw new InputError(
        "금액을 입력해 주세요. 미확인은 기록을 추가하지 않아도 됩니다.",
      );
    let old: Observation | undefined;
    if (mode === "correct") {
      old =
        (await db
          .prepare(
            "SELECT * FROM account_observations WHERE id=? AND account_id=? AND metric=? AND superseded_by IS NULL",
          )
          .bind(textValue(form, "observation_id"), a.id, metric)
          .first<Observation>()) ?? undefined;
      if (!old)
        throw new ConflictError(
          "정정할 기록이 변경되었습니다. 새로고침해 주세요.",
        );
    }
    const newId = id();
    if (old)
      statements.push(
        db
          .prepare("UPDATE account_observations SET superseded_by=? WHERE id=?")
          .bind(newId, old.id),
      );
    statements.push(
      obsInsert(db, a.id, metric, amount, date, ev, newId, old, reason),
    );
  }
  await commit(db, statements);
}
export async function saveProduct(db: D1Database, a: Account, form: FormData) {
  if (!isInvestment(a.account_type) || a.archived_at)
    throw new InputError("활성 투자계좌에서 상품을 관리할 수 있습니다.");
  const name = textValue(form, "name", true, 120),
    q = quantity(textValue(form, "quantity")),
    date = dateValue(textValue(form, "as_of_date"), a.tracking_start_date),
    productId = textValue(form, "product_id"),
    mode = textValue(form, "mode");
  const risk =
    a.account_type === "irp"
      ? choice(textValue(form, "risk_class"), risks)
      : null;
  const statements = [guard(db, a, form)];
  const newId = id();
  let actualId = productId;
  if (productId) {
    const p = await db
      .prepare("SELECT * FROM investment_products WHERE id=? AND account_id=?")
      .bind(productId, a.id)
      .first<Product>();
    if (!p) throw new InputError("소속 상품을 확인해 주세요.");
    statements.push(
      db
        .prepare(
          "UPDATE investment_products SET name=?,version=version+1,updated_at=? WHERE id=?",
        )
        .bind(name, now(), productId),
    );
  } else {
    actualId = id();
    statements.push(
      db
        .prepare(
          "INSERT INTO investment_products(id,account_id,name,created_at,updated_at) VALUES(?,?,?,?,?)",
        )
        .bind(actualId, a.id, name, now(), now()),
    );
  }
  let old: ProductObservation | undefined;
  const reason = textValue(form, "reason", mode === "correct");
  if (mode === "correct") {
    old =
      (await db
        .prepare(
          "SELECT * FROM product_observations WHERE id=? AND product_id=? AND superseded_by IS NULL",
        )
        .bind(textValue(form, "observation_id"), actualId)
        .first<ProductObservation>()) ?? undefined;
    if (!old)
      throw new ConflictError("상품 기록이 변경되었습니다. 새로고침해 주세요.");
    statements.push(
      db
        .prepare("UPDATE product_observations SET superseded_by=? WHERE id=?")
        .bind(newId, old.id),
    );
  }
  statements.push(
    db
      .prepare(
        "INSERT INTO product_observations(id,product_id,quantity_decimal,as_of_date,risk_class,revision_of,correction_reason,recorded_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .bind(newId, actualId, q, date, risk, old?.id ?? null, reason, now()),
  );
  statements.push(
    db
      .prepare("UPDATE accounts SET holdings_status='some' WHERE id=?")
      .bind(a.id),
  );
  await commit(db, statements);
}
export async function confirmNoHoldings(
  db: D1Database,
  a: Account,
  form: FormData,
) {
  if (!isInvestment(a.account_type) || a.archived_at)
    throw new InputError("활성 투자계좌에서 확인해 주세요.");
  const products = await db
    .prepare("SELECT COUNT(*) n FROM investment_products WHERE account_id=?")
    .bind(a.id)
    .first<{ n: number }>();
  if (products?.n)
    throw new InputError(
      "등록 상품이 있으면 각 상품의 수량을 0으로 확인해 주세요.",
    );
  await commit(db, [
    guard(db, a, form),
    db
      .prepare("UPDATE accounts SET holdings_status='none' WHERE id=?")
      .bind(a.id),
  ]);
}
export interface ReportRow {
  id: string;
  as_of_date: string;
  generated_at: string;
  template_version: string;
  input_snapshot: string;
  markdown: string;
  status: "draft" | "saved";
  session_id: string | null;
  draft_expires_at: string;
  request_key: string;
}
export async function draftReport(
  db: D1Database,
  asOf: string,
  sessionId: string,
  requestKey: string,
) {
  const existing = await db
    .prepare("SELECT * FROM reports WHERE request_key=? AND session_id=?")
    .bind(requestKey, sessionId)
    .first<ReportRow>();
  if (existing) {
    if (existing.status === "draft" && existing.draft_expires_at < now())
      throw new InputError(
        "미리보기가 만료되었습니다. 새로고침 후 다시 생성해 주세요.",
      );
    return existing.id;
  }
  const data = await snapshot(db, asOf),
    reportId = id(),
    markdown = makeMarkdown(data);
  await db
    .prepare("DELETE FROM reports WHERE status='draft' AND draft_expires_at<?")
    .bind(now())
    .run();
  await db
    .prepare(
      "INSERT INTO reports(id,as_of_date,generated_at,template_version,input_snapshot,markdown,status,session_id,draft_expires_at,request_key) VALUES(?,?,?,?,?,?,'draft',?,?,?)",
    )
    .bind(
      reportId,
      asOf,
      data.generatedAt,
      "1",
      JSON.stringify(data),
      markdown,
      sessionId,
      new Date(Date.now() + 3600000).toISOString(),
      requestKey,
    )
    .run();
  return reportId;
}
export async function readReport(
  db: D1Database,
  reportId: string,
  sessionId: string,
) {
  const r = await db
    .prepare("SELECT * FROM reports WHERE id=?")
    .bind(reportId)
    .first<ReportRow>();
  if (
    !r ||
    (r.status === "draft" &&
      (r.session_id !== sessionId || r.draft_expires_at < now()))
  )
    throw new Response(
      "보고서가 없거나 미리보기가 만료되었습니다. 새로 생성해 주세요.",
      { status: 404 },
    );
  return r;
}
export async function finalizeReport(
  db: D1Database,
  reportId: string,
  sessionId: string,
) {
  const r = await readReport(db, reportId, sessionId);
  if (r.status === "saved") return r;
  const updated = await db
    .prepare(
      "UPDATE reports SET status='saved' WHERE id=? AND status='draft' AND session_id=? AND draft_expires_at>=?",
    )
    .bind(reportId, sessionId, now())
    .run();
  if (!updated.meta.changes) {
    const latest = await readReport(db, reportId, sessionId);
    if (latest.status !== "saved")
      throw new InputError("미리보기가 만료되었습니다. 새로 생성해 주세요.");
    return latest;
  }
  return { ...r, status: "saved" as const };
}
