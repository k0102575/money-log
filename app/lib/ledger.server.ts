import {
  choice,
  ConflictError,
  dateValue,
  InputError,
  money,
  textValue,
  today,
} from "./domain.ts";
import { ledgerKinds, ledgerStart, transferCategories } from "./ledger.ts";
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

export async function saveTransaction(
  db: D1Database,
  form: FormData,
  recurringId?: string,
) {
  const transactionId = textValue(form, "transaction_id");
  const version = Number(textValue(form, "version"));
  let occurredOn: string;
  try {
    occurredOn = dateValue(textValue(form, "occurred_on"), ledgerStart);
  } catch {
    throw new InputError(
      "거래일은 2026년 11월 1일부터 오늘 사이의 날짜를 입력해 주세요.",
    );
  }
  const kind = choice(textValue(form, "kind"), ledgerKinds);
  const amount = money(textValue(form, "amount"));
  if (!amount) throw new InputError("거래 금액을 1원 이상 입력해 주세요.");
  const accountId = textValue(form, "account_id");
  const destinationId =
    kind === "transfer" ? textValue(form, "destination_id") : null;
  if (kind === "transfer" && (!destinationId || destinationId === accountId)) {
    throw new InputError("출금 계좌와 다른 입금 계좌를 선택해 주세요.");
  }
  const category =
    kind === "transfer"
      ? choice(textValue(form, "transfer_category"), transferCategories)
      : textValue(form, "category", false, 40);
  const note = textValue(form, "note", false, 300);

  const accounts = (
    await db
      .prepare("SELECT id, archived_at FROM accounts WHERE id IN (?, ?)")
      .bind(accountId, destinationId)
      .all<{ id: string; archived_at: string | null }>()
  ).results;
  const existing = transactionId
    ? await db
        .prepare("SELECT * FROM ledger_transactions WHERE id=?")
        .bind(transactionId)
        .first<Transaction>()
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
  const result = await db
    .prepare("DELETE FROM ledger_transactions WHERE id=? AND version=?")
    .bind(
      textValue(form, "transaction_id", true),
      Number(textValue(form, "version", true)),
    )
    .run();
  if (!result.meta.changes)
    throw new ConflictError(
      "거래가 변경되었습니다. 새로고침 후 다시 확인해 주세요.",
    );
}
