import { dateValue, InputError, money, textValue, today } from "./domain.ts";
import type { Account } from "./domain.ts";
import type { Transaction } from "./ledger.ts";
import { ledgerStart } from "./ledger.ts";
import { saveTransaction } from "./ledger.server.ts";
import { savingsDueDate, type SavingsRule } from "./recurring-savings.ts";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function listSavingsRules(db: D1Database) {
  return (
    await db
      .prepare("SELECT * FROM recurring_savings ORDER BY effective_month DESC")
      .all<SavingsRule>()
  ).results;
}

function savingsId(destinationId: string, month: string) {
  return `saving:${month}:${destinationId}`;
}

function linkDateRange(month: string) {
  const [year, number] = month.split("-").map(Number);
  return [-2, 1].map((offset) =>
    new Date(Date.UTC(year, number + offset, 1)).toISOString().slice(0, 10),
  );
}

export async function plannedSavings(
  db: D1Database,
  rules: SavingsRule[],
  month: string,
) {
  const confirmed = (
    await db
      .prepare(
        "SELECT id, occurred_on, amount_krw, account_id FROM ledger_transactions WHERE id >= ? AND id < ?",
      )
      .bind(`saving:${month}:`, `saving:${month};`)
      .all<{
        id: string;
        occurred_on: string;
        amount_krw: number;
        account_id: string;
      }>()
  ).results;
  return projectSavings(rules, month, confirmed);
}

export function projectSavings(
  rules: SavingsRule[],
  month: string,
  confirmed: Pick<
    Transaction,
    "id" | "occurred_on" | "amount_krw" | "account_id"
  >[],
  accounts?: Account[],
) {
  const effective = new Map<string, SavingsRule>();
  for (const rule of rules) {
    if (rule.effective_month <= month && !effective.has(rule.destination_id))
      effective.set(rule.destination_id, rule);
  }
  return Array.from(effective.values()).flatMap((rule) => {
    const due = savingsDueDate(rule, month);
    const match = confirmed.find(
      (row) => row.id === savingsId(rule.destination_id, month),
    );
    const transaction = match
      ? {
          id: match.id,
          occurred_on: match.occurred_on,
          amount_krw: match.amount_krw,
          account_id: match.account_id,
        }
      : undefined;
    return transaction || !rule.ends_on || due <= rule.ends_on
      ? [
          {
            rule,
            due,
            transaction,
            blocked:
              !transaction &&
              !!accounts &&
              [rule.account_id, rule.destination_id].some(
                (id) =>
                  !accounts.some(
                    (account) => account.id === id && !account.archived_at,
                  ),
              ),
          },
        ]
      : [];
  });
}

export async function saveSavingsRule(db: D1Database, form: FormData) {
  const month = textValue(form, "effective_month");
  const day = Number(textValue(form, "payment_day"));
  const amount = money(textValue(form, "amount"));
  const end = textValue(form, "ends_on");
  const source = textValue(form, "account_id");
  const destination = textValue(form, "destination_id");
  if (!monthPattern.test(month) || month < ledgerStart.slice(0, 7))
    throw new InputError("적용 월은 2026년 11월 이후로 선택해 주세요.");
  if (!Number.isInteger(day) || day < 1 || day > 31 || !amount)
    throw new InputError("납입일은 1~31일, 금액은 1원 이상으로 입력해 주세요.");
  if (
    end &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      Number.isNaN(Date.parse(end)) ||
      new Date(end).toISOString().slice(0, 10) !== end ||
      end < `${month}-01`)
  )
    throw new InputError("종료일은 적용 월의 첫날 이후 날짜를 입력해 주세요.");

  const result = await db
    .prepare(
      `
    INSERT INTO recurring_savings(destination_id, effective_month, account_id, payment_day, amount_krw, ends_on)
    SELECT destination.id, ?, source.id, ?, ?, ?
    FROM accounts AS source JOIN accounts AS destination ON source.id <> destination.id
    WHERE source.id = ? AND destination.id = ?
      AND source.archived_at IS NULL AND destination.archived_at IS NULL
      AND source.account_type IN ('checking', 'cma', 'cash')
      AND destination.account_type IN ('savings', 'housing')
    ON CONFLICT(destination_id, effective_month) DO UPDATE SET
      account_id=excluded.account_id, payment_day=excluded.payment_day,
      amount_krw=excluded.amount_krw, ends_on=excluded.ends_on
  `,
    )
    .bind(month, day, amount, end || null, source, destination)
    .run();
  if (!result.meta.changes)
    throw new InputError(
      "사용 가능한 출금 계좌와 적금·청약 계좌를 선택해 주세요.",
    );
}

export async function confirmSavings(
  db: D1Database,
  form: FormData,
  month: string,
) {
  const destination = textValue(form, "destination_id");
  const plans = await plannedSavings(db, await listSavingsRules(db), month);
  const plan = plans.find(({ rule }) => rule.destination_id === destination);
  if (!plan) throw new InputError("예정 납입을 다시 확인해 주세요.");
  if (plan.transaction) return;
  const existingId = textValue(form, "existing_transaction_id");
  if (existingId) {
    const [start, end] = linkDateRange(month);
    const linked = await db
      .prepare(
        "UPDATE ledger_transactions SET id=?, category='saving',version=version+1 WHERE id=? AND version=? AND kind='transfer' AND account_id=? AND destination_id=? AND occurred_on>=? AND occurred_on<? AND id NOT LIKE 'saving:%' AND NOT EXISTS (SELECT 1 FROM ledger_transactions payment WHERE payment.id=? OR payment.funding_transfer_id=ledger_transactions.id) AND (SELECT COUNT(*) FROM accounts WHERE id IN (ledger_transactions.account_id,ledger_transactions.destination_id) AND archived_at IS NULL)=2",
      )
      .bind(
        savingsId(destination, month),
        existingId,
        Number(textValue(form, "existing_version")),
        plan.rule.account_id,
        destination,
        start,
        end,
        savingsId(destination, month),
      )
      .run();
    if (!linked.meta.changes)
      throw new InputError(
        "거래가 변경되었습니다. 새로고침 후 다시 선택해 주세요.",
      );
    return;
  }
  if (JSON.stringify(plan.rule) !== form.get("rule"))
    throw new InputError(
      "반복 설정이 바뀌었습니다. 예정 납입을 다시 확인해 주세요.",
    );

  const duplicate = await db
    .prepare(
      "SELECT occurred_on,amount_krw FROM ledger_transactions WHERE kind='transfer' AND account_id=? AND destination_id=? AND id NOT LIKE 'saving:%' AND (substr(occurred_on,1,7)=? OR occurred_on=?) LIMIT 1",
    )
    .bind(
      plan.rule.account_id,
      destination,
      month,
      textValue(form, "occurred_on"),
    )
    .first<{ occurred_on: string; amount_krw: number }>();
  if (duplicate) {
    const confirmed = await db
      .prepare("SELECT id FROM ledger_transactions WHERE id=?")
      .bind(savingsId(destination, month))
      .first();
    if (confirmed) return;
    throw new InputError(
      `이미 같은 출금·입금 계좌의 이체가 있습니다. 가계부에서 기존 거래를 확인해 주세요. 중복 납입을 막기 위해 추가 등록을 중단했습니다.`,
    );
  }
  const fundingAccount = textValue(form, "funding_account_id");
  if (fundingAccount) {
    const occurredOn = dateValue(textValue(form, "occurred_on"), ledgerStart);
    const fundingDate = dateValue(
      textValue(form, "funding_date") || occurredOn,
      ledgerStart,
    );
    if (fundingDate > occurredOn)
      throw new InputError(
        "CMA 이체일은 실제 납입일과 같거나 그 이전이어야 합니다.",
      );
    const amount = money(textValue(form, "amount"));
    const fundingAmount = money(textValue(form, "funding_amount")) ?? amount;
    if (!amount || !fundingAmount)
      throw new InputError("이체액과 납입액은 1원 이상 입력해 주세요.");

    const account = plan.rule.account_id;
    const paymentId = savingsId(destination, month);
    const fundingId = `funding:${paymentId}`;
    const result = await db
      .prepare(
        `
      WITH pair(id, occurred_on, amount_krw, account_id, destination_id, category, funding_transfer_id) AS (
        VALUES (?, ?, ?, ?, ?, 'general', NULL), (?, ?, ?, ?, ?, 'saving', ?)
      )
      INSERT INTO ledger_transactions(id, occurred_on, kind, amount_krw, account_id, destination_id, category, funding_transfer_id)
      SELECT id, occurred_on, 'transfer', amount_krw, account_id, destination_id, category, funding_transfer_id FROM pair
      WHERE (SELECT COUNT(*) FROM accounts WHERE id IN (?, ?, ?) AND archived_at IS NULL) = 3
        AND EXISTS (SELECT 1 FROM accounts WHERE id=? AND account_type='cma')
        AND NOT EXISTS (
          SELECT 1 FROM ledger_transactions WHERE id IN (?, ?)
            OR (kind='transfer' AND account_id=? AND destination_id=? AND id NOT LIKE 'saving:%'
              AND (substr(occurred_on,1,7)=? OR occurred_on=?))
            OR (kind='transfer' AND account_id=? AND destination_id=?
              AND occurred_on=? AND amount_krw=? AND id NOT LIKE 'funding:saving:%')
        )
    `,
      )
      .bind(
        fundingId,
        fundingDate,
        fundingAmount,
        fundingAccount,
        account,
        paymentId,
        occurredOn,
        amount,
        account,
        destination,
        fundingId,
        fundingAccount,
        account,
        destination,
        fundingAccount,
        fundingId,
        paymentId,
        account,
        destination,
        month,
        occurredOn,
        fundingAccount,
        account,
        fundingDate,
        fundingAmount,
      )
      .run();
    if (result.meta.changes) return;

    const confirmed = await db
      .prepare("SELECT id FROM ledger_transactions WHERE id=?")
      .bind(paymentId)
      .first();
    if (confirmed) return;
    throw new InputError(
      "CMA 이체가 이미 기록됐거나 사용할 수 없는 계좌입니다. 이체를 기록해 뒀다면 CMA 충당을 끄고 납입만 확정해 주세요.",
    );
  }

  const transaction = new FormData();
  transaction.set("occurred_on", textValue(form, "occurred_on"));
  transaction.set("amount", textValue(form, "amount"));
  transaction.set("kind", "transfer");
  transaction.set("transfer_category", "saving");
  transaction.set("account_id", plan.rule.account_id);
  transaction.set("destination_id", destination);
  await saveTransaction(db, transaction, savingsId(destination, month));
}

export async function manageSavingsRule(db: D1Database, form: FormData) {
  const destination = textValue(form, "destination_id", true);
  if (form.get("intent") === "delete-savings") {
    const result = await db
      .prepare(
        `
      DELETE FROM recurring_savings WHERE destination_id=?
      AND NOT EXISTS (SELECT 1 FROM ledger_transactions WHERE id LIKE ?)
    `,
      )
      .bind(destination, `saving:%:${destination}`)
      .run();
    if (!result.meta.changes)
      throw new InputError(
        "확정한 납입이 있거나 설정이 변경되었습니다. 확정 내역이 있는 규칙은 납입 중단을 사용해 주세요.",
      );
    return;
  }
  const month = textValue(form, "stop_month", true);
  if (!monthPattern.test(month) || month < today().slice(0, 7))
    throw new InputError("중단할 달을 확인해 주세요.");
  const [year, number] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, number - 1, 0))
    .toISOString()
    .slice(0, 10);
  const result = await db
    .prepare(
      "UPDATE recurring_savings SET ends_on=? WHERE destination_id=? AND (ends_on IS NULL OR ends_on>?)",
    )
    .bind(end, destination, end)
    .run();
  if (!result.meta.changes)
    throw new InputError("이미 해당 달 이전에 종료되었거나 설정이 없습니다.");
}

export async function savingsPageData(
  db: D1Database,
  month: string,
  includeLedger: boolean | "link-candidates" = false,
) {
  const queries = [
    db.prepare(
      "SELECT * FROM accounts ORDER BY archived_at IS NOT NULL,created_at,id",
    ),
    db.prepare("SELECT * FROM recurring_savings ORDER BY effective_month DESC"),
    db
      .prepare(
        "SELECT id,occurred_on,amount_krw,account_id FROM ledger_transactions WHERE id>=? AND id<?",
      )
      .bind(`saving:${month}:`, `saving:${month};`),
  ];
  if (includeLedger === "link-candidates") {
    const [start, end] = linkDateRange(month);
    queries.push(
      db
        .prepare(
          `
      SELECT t.* FROM ledger_transactions t
      WHERE t.kind='transfer' AND t.id NOT LIKE 'saving:%'
        AND t.occurred_on>=? AND t.occurred_on<?
        AND NOT EXISTS (SELECT 1 FROM ledger_transactions payment WHERE payment.funding_transfer_id=t.id)
        AND EXISTS (SELECT 1 FROM recurring_savings r WHERE r.account_id=t.account_id AND r.destination_id=t.destination_id)
      ORDER BY t.occurred_on DESC,t.created_at DESC,t.id
    `,
        )
        .bind(start, end),
    );
  } else if (includeLedger) {
    queries.push(
      db
        .prepare(
          `
      SELECT t.*, coalesce(funding.id,payment.id) AS linked_id,
        coalesce(funding.version,payment.version) AS linked_version,
        coalesce(funding.occurred_on,payment.occurred_on) AS linked_date,
        coalesce(funding.amount_krw,payment.amount_krw) AS linked_amount,
        coalesce(funding.kind,payment.kind) AS linked_kind
      FROM ledger_transactions t
      LEFT JOIN ledger_transactions funding ON funding.id=t.funding_transfer_id
      LEFT JOIN ledger_transactions payment ON payment.funding_transfer_id=t.id
      WHERE t.occurred_on>=? AND t.occurred_on<=?
      ORDER BY t.occurred_on DESC,t.created_at DESC,t.id
    `,
        )
        .bind(`${month}-01`, `${month}-31`),
    );
  }
  const results = await db.batch(queries);
  const accounts = results[0].results as unknown as Account[];
  const rules = results[1].results as unknown as SavingsRule[];
  const confirmed = results[2].results as unknown as Transaction[];
  return {
    accounts,
    rules,
    plans: projectSavings(rules, month, confirmed, accounts),
    rows: (results[3]?.results ?? []) as unknown as (Transaction & {
      linked_id?: string | null;
      linked_version?: number | null;
      linked_date?: string | null;
      linked_amount?: number | null;
      linked_kind?: Transaction["kind"] | null;
    })[],
  };
}
