import { InputError, money, textValue } from "./domain.ts";
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

export async function plannedSavings(
  db: D1Database,
  rules: SavingsRule[],
  month: string,
) {
  const effective = new Map<string, SavingsRule>();
  for (const rule of rules) {
    if (rule.effective_month <= month && !effective.has(rule.destination_id))
      effective.set(rule.destination_id, rule);
  }
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
  return Array.from(effective.values()).flatMap((rule) => {
    const due = savingsDueDate(rule, month);
    const transaction = confirmed.find(
      (row) => row.id === savingsId(rule.destination_id, month),
    );
    return transaction || !rule.ends_on || due <= rule.ends_on
      ? [{ rule, due, transaction }]
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
  if (JSON.stringify(plan.rule) !== form.get("rule"))
    throw new InputError(
      "반복 설정이 바뀌었습니다. 예정 납입을 다시 확인해 주세요.",
    );

  const transaction = new FormData();
  transaction.set("occurred_on", textValue(form, "occurred_on"));
  transaction.set("amount", textValue(form, "amount"));
  transaction.set("kind", "transfer");
  transaction.set("transfer_category", "saving");
  transaction.set("account_id", plan.rule.account_id);
  transaction.set("destination_id", destination);
  await saveTransaction(db, transaction, savingsId(destination, month));
}
