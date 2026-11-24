import type { Account } from "./domain.ts";
import {
  choice,
  ConflictError,
  dateValue,
  InputError,
  money,
  textValue,
  today,
} from "./domain.ts";
import {
  ledgerKinds,
  ledgerStart,
  transferCategories,
  suggestedTransferCategory,
} from "./ledger.ts";
import type { Transaction } from "./ledger.ts";

export function ledgerMonth(value: string | null) {
  const latest = today().slice(0, 7);
  return value &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    value >= ledgerStart.slice(0, 7) &&
    value <= latest
    ? value
    : latest;
}

function transactionDate(form: FormData) {
  try {
    return dateValue(textValue(form, "occurred_on"), ledgerStart);
  } catch {
    throw new InputError(
      "거래일은 2026년 11월 1일부터 오늘 사이의 날짜를 입력해 주세요.",
    );
  }
}

export async function saveTransferThenExpense(db: D1Database, form: FormData) {
  if (textValue(form, "transaction_id"))
    throw new InputError("이체 후 지출은 새 거래로 추가해 주세요.");

  const occurredOn = transactionDate(form);
  const source = textValue(form, "account_id");
  const spendingAccount = textValue(form, "destination_id");
  if (!source || !spendingAccount || source === spendingAccount)
    throw new InputError("출금 계좌와 지출 계좌를 서로 다르게 선택해 주세요.");

  const amount = money(textValue(form, "amount"));
  if (!amount) throw new InputError("지출액을 1원 이상 입력해 주세요.");

  const category = textValue(form, "category", false, 40);
  const note = textValue(form, "note", false, 300);
  const requestKey = textValue(form, "request_key", true, 36);
  if (!/^[0-9a-f-]{36}$/i.test(requestKey))
    throw new InputError("화면을 새로고침한 뒤 다시 저장해 주세요.");

  const expenseId = `funded-expense:${requestKey}`;
  const choice = textValue(form, "funding_choice");
  const existingId = choice && choice !== "new" ? choice : null;
  const fundingId = existingId ?? requestKey;
  const result = await db
    .prepare(
      `
    WITH matching AS (
      SELECT transfer.id FROM ledger_transactions AS transfer
      WHERE transfer.kind='transfer' AND transfer.category='general'
        AND transfer.occurred_on=? AND transfer.amount_krw=?
        AND transfer.account_id=? AND transfer.destination_id=? AND transfer.funding_transfer_id IS NULL
    ), pair(id, occurred_on, kind, amount_krw, account_id, destination_id, category, note, funding_transfer_id) AS (
      SELECT ?, ?, 'transfer', ?, ?, ?, 'general', '', NULL WHERE ? IS NULL
      UNION ALL
      SELECT ?, ?, 'expense', ?, ?, NULL, ?, ?, ?
    )
    INSERT INTO ledger_transactions(id, occurred_on, kind, amount_krw, account_id, destination_id, category, note, funding_transfer_id)
    SELECT * FROM pair
    WHERE (SELECT COUNT(*) FROM accounts WHERE id IN (?, ?) AND archived_at IS NULL) = 2
      AND NOT EXISTS (SELECT 1 FROM ledger_transactions WHERE id IN (?, ?))
      AND (
        (? IS NULL AND (?='new' OR NOT EXISTS (SELECT 1 FROM matching)))
        OR (? IN (SELECT id FROM matching) AND NOT EXISTS (
          SELECT 1 FROM ledger_transactions WHERE funding_transfer_id=?
        ))
      )
  `,
    )
    .bind(
      occurredOn,
      amount,
      source,
      spendingAccount,
      requestKey,
      occurredOn,
      amount,
      source,
      spendingAccount,
      existingId,
      expenseId,
      occurredOn,
      amount,
      spendingAccount,
      category,
      note,
      fundingId,
      source,
      spendingAccount,
      requestKey,
      expenseId,
      existingId,
      choice,
      existingId,
      existingId,
    )
    .run();
  if (result.meta.changes) return;

  const saved = await db
    .prepare(
      "SELECT id, funding_transfer_id FROM ledger_transactions WHERE id IN (?, ?)",
    )
    .bind(requestKey, expenseId)
    .all<{ id: string; funding_transfer_id: string | null }>();
  if (
    saved.results.some(
      (row) => row.id === expenseId && row.funding_transfer_id === fundingId,
    )
  )
    return;
  if (saved.results.length)
    throw new ConflictError(
      "이미 저장한 거래가 변경되었습니다. 가계부를 확인해 주세요.",
    );
  if (existingId)
    throw new InputError(
      "선택한 이체가 변경되었거나 이미 연결되었습니다. 가계부를 새로고침해 주세요.",
    );
  const matching = await db
    .prepare(
      `
    SELECT id FROM ledger_transactions
    WHERE kind='transfer' AND category='general' AND occurred_on=? AND amount_krw=?
      AND account_id=? AND destination_id=? LIMIT 1
  `,
    )
    .bind(occurredOn, amount, source, spendingAccount)
    .first();
  if (matching)
    throw new InputError(
      "같은 날짜·계좌·금액의 이체가 있습니다. 해당 월 가계부를 새로고침한 뒤 기존 이체를 선택하거나, 별도로 보낸 이체라면 새 이체로 기록해 주세요.",
    );
  throw new InputError("사용 가능한 계좌를 선택해 주세요.");
}

export async function saveTransaction(
  db: D1Database,
  form: FormData,
  recurringId?: string,
) {
  const transactionId = textValue(form, "transaction_id");
  const version = Number(textValue(form, "version"));
  const occurredOn = transactionDate(form);
  const kind = choice(textValue(form, "kind"), ledgerKinds);
  const amount = money(textValue(form, "amount"));
  if (!amount) throw new InputError("거래 금액을 1원 이상 입력해 주세요.");
  const accountId = textValue(form, "account_id");
  const destinationId =
    kind === "transfer" ? textValue(form, "destination_id") : null;
  if (kind === "transfer" && (!destinationId || destinationId === accountId)) {
    throw new InputError("출금 계좌와 다른 입금 계좌를 선택해 주세요.");
  }
  let category =
    kind === "transfer"
      ? choice(textValue(form, "transfer_category"), transferCategories)
      : textValue(form, "category", false, 40);
  const note = textValue(form, "note", false, 300);

  const accounts = (
    await db
      .prepare(
        "SELECT id, account_type, archived_at FROM accounts WHERE id IN (?, ?)",
      )
      .bind(accountId, destinationId)
      .all<Pick<Account, "id" | "account_type" | "archived_at">>()
  ).results;
  if (kind === "transfer" && category !== "general") {
    category = suggestedTransferCategory(
      accounts.find((account) => account.id === accountId),
      accounts.find((account) => account.id === destinationId),
    );
  }
  const existing = transactionId
    ? await db
        .prepare(
          `
          SELECT t.*, payment.id AS funded_payment_id FROM ledger_transactions t
          LEFT JOIN ledger_transactions payment ON payment.funding_transfer_id=t.id
          WHERE t.id=?
        `,
        )
        .bind(transactionId)
        .first<Transaction & { funded_payment_id: string | null }>()
    : null;
  if (
    existing?.id.startsWith("saving:") &&
    (kind !== "transfer" ||
      category !== "saving" ||
      destinationId !== existing.destination_id)
  ) {
    throw new InputError(
      "확정한 납입은 같은 입금 계좌의 저축 이체로 유지해 주세요.",
    );
  }
  if (
    existing &&
    (existing.funding_transfer_id || existing.funded_payment_id) &&
    (kind !== existing.kind ||
      accountId !== existing.account_id ||
      destinationId !== existing.destination_id)
  ) {
    throw new InputError(
      "연결된 거래의 유형과 계좌는 같아야 합니다. 계좌를 바꾸려면 연결 거래를 확인하고 다시 등록해 주세요.",
    );
  }
  const previousAccounts = [existing?.account_id, existing?.destination_id];
  for (const id of [accountId, ...(destinationId ? [destinationId] : [])]) {
    const account = accounts.find((candidate) => candidate.id === id);
    if (!account || (account.archived_at && !previousAccounts.includes(id))) {
      throw new InputError("사용 가능한 계좌를 선택해 주세요.");
    }
  }

  if (transactionId) {
    const result = await db
      .prepare(
        "UPDATE ledger_transactions SET occurred_on=?,kind=?,amount_krw=?,account_id=?,destination_id=?,category=?,note=?,version=version+1 WHERE id=? AND version=?",
      )
      .bind(
        occurredOn,
        kind,
        amount,
        accountId,
        destinationId,
        category,
        note,
        transactionId,
        version,
      )
      .run();
    if (!result.meta.changes)
      throw new ConflictError(
        "거래가 변경되었습니다. 새로고침 후 다시 확인해 주세요.",
      );
  } else {
    const requestKey = recurringId ?? textValue(form, "request_key", true, 36);
    if (!recurringId && !/^[0-9a-f-]{36}$/i.test(requestKey))
      throw new InputError("화면을 새로고침한 뒤 다시 저장해 주세요.");
    await db
      .prepare(
        "INSERT INTO ledger_transactions(id,occurred_on,kind,amount_krw,account_id,destination_id,category,note) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(
        requestKey,
        occurredOn,
        kind,
        amount,
        accountId,
        destinationId,
        category,
        note,
      )
      .run();
  }
  return occurredOn.slice(0, 7);
}

export async function deleteTransaction(db: D1Database, form: FormData) {
  const id = textValue(form, "transaction_id", true);
  const version = Number(textValue(form, "version", true));
  const linkedId =
    form.get("delete_linked") === "yes"
      ? textValue(form, "linked_id", true)
      : null;
  const result = linkedId
    ? await db
        .prepare(
          `
        WITH pair AS MATERIALIZED (
          SELECT first.id AS first_id, second.id AS second_id
          FROM ledger_transactions AS first JOIN ledger_transactions AS second
            ON (first.funding_transfer_id=second.id OR second.funding_transfer_id=first.id)
          WHERE first.id=? AND first.version=? AND second.id=? AND second.version=?
        )
        DELETE FROM ledger_transactions WHERE id IN (
          SELECT first_id FROM pair UNION ALL SELECT second_id FROM pair
        )
      `,
        )
        .bind(
          id,
          version,
          linkedId,
          Number(textValue(form, "linked_version", true)),
        )
        .run()
    : await db
        .prepare("DELETE FROM ledger_transactions WHERE id=? AND version=?")
        .bind(id, version)
        .run();
  if (!result.meta.changes)
    throw new ConflictError(
      "거래가 변경되었습니다. 새로고침 후 다시 확인해 주세요.",
    );
}
