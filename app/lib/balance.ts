import type { Observation } from "./domain.ts";
import { ledgerStart, type Transaction } from "./ledger.ts";

export function balanceHistory(
  accountId: string,
  observations: Observation[],
  transactions: Transaction[],
  asOf: string,
  reconcile: boolean,
) {
  const confirmations = observations
    .filter(
      (row) =>
        row.account_id === accountId &&
        row.metric === "cash_balance" &&
        !row.superseded_by &&
        row.as_of_date <= asOf,
    )
    .sort((a, b) => a.as_of_date.localeCompare(b.as_of_date));
  const movements = new Map<string, bigint>();
  for (const row of transactions) {
    if (row.occurred_on > asOf) continue;
    let change = 0n;
    if (row.account_id === accountId) {
      change +=
        row.kind === "income"
          ? BigInt(row.amount_krw)
          : -BigInt(row.amount_krw);
    }
    if (row.destination_id === accountId && row.kind === "transfer") {
      change += BigInt(row.amount_krw);
    }
    movements.set(
      row.occurred_on,
      (movements.get(row.occurred_on) ?? 0n) + change,
    );
  }
  const netAfter = (start: Observation, end: string, beforeEnd = false) => {
    let net = 0n;
    for (const [date, change] of movements) {
      const afterStart =
        date > start.as_of_date ||
        (date === start.as_of_date && start.before_day_transactions === 1);
      if (afterStart && (date < end || (date === end && !beforeEnd)))
        net += change;
    }
    return net;
  };

  const base = confirmations.at(-1);
  const calculated = base
    ? BigInt(base.amount_krw) + netAfter(base, asOf)
    : null;
  const adjustments = reconcile
    ? confirmations
        .slice(1)
        .map((row, index) => {
          const previous = confirmations[index];
          const expected =
            BigInt(previous.amount_krw) +
            netAfter(
              previous,
              row.as_of_date,
              row.before_day_transactions === 1,
            );
          return {
            date: row.as_of_date,
            previousDate: previous.as_of_date,
            expected: expected.toString(),
            confirmed: row.amount_krw,
            difference: (BigInt(row.amount_krw) - expected).toString(),
            partial:
              previous.as_of_date < "2026-10-31" &&
              row.as_of_date >= ledgerStart,
          };
        })
        .reverse()
    : [];

  return {
    calculated: calculated?.toString() ?? null,
    includesBaseDay: base?.before_day_transactions === 1,
    baseDate: base?.as_of_date ?? null,
    partial: !!base && base.as_of_date < "2026-10-31" && asOf >= ledgerStart,
    adjustments,
  };
}

export function balanceWon(value: string | null) {
  return value === null
    ? "기준 잔액 미입력"
    : `${BigInt(value).toLocaleString("ko-KR")}원`;
}
