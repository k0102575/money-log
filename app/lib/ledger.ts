import type { Account } from "./domain.ts";
export const ledgerStart = "2026-11-01";

export const ledgerKinds = {
  income: "수입",
  expense: "지출",
  transfer: "계좌이체",
  repayment: "부채 상환",
} as const;

export const transferCategories = {
  general: "일반 이체",
  saving: "저축 납입",
  investment: "투자 납입",
} as const;

export interface Transaction {
  id: string;
  occurred_on: string;
  kind: keyof typeof ledgerKinds;
  amount_krw: number;
  account_id: string;
  destination_id: string | null;
  category: string;
  note: string;
  version: number;
}

export function contributionGroup(row: Transaction, accounts: Account[]) {
  const groups: Record<string, "saving" | "isa" | "pension"> = {
    savings: "saving",
    housing: "saving",
    isa: "isa",
    pension: "pension",
    irp: "pension",
  };
  const source = accounts.find((account) => account.id === row.account_id);
  const destination = accounts.find(
    (account) => account.id === row.destination_id,
  );
  return row.kind === "transfer" &&
    ["saving", "investment"].includes(row.category) &&
    destination &&
    !groups[source?.account_type ?? ""]
    ? groups[destination.account_type]
    : undefined;
}

export function ledgerSummary(rows: Transaction[], accounts?: Account[]) {
  const totals = {
    income: 0n,
    expense: 0n,
    transfer: 0n,
    repayment: 0n,
    saving: 0n,
    investment: 0n,
  };
  for (const row of rows) {
    const amount = BigInt(row.amount_krw);
    totals[row.kind] += amount;
    if (
      row.kind === "transfer" &&
      (row.category === "saving" || row.category === "investment")
    ) {
      const group = accounts ? contributionGroup(row, accounts) : null;
      if (!accounts || group)
        totals[
          accounts
            ? group === "saving"
              ? "saving"
              : "investment"
            : row.category
        ] += amount;
    }
  }
  return {
    ...totals,
    net: totals.income - totals.expense - totals.repayment,
  };
}
