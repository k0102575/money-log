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

export function ledgerSummary(rows: Transaction[]) {
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
      totals[row.category] += amount;
    }
  }
  return {
    ...totals,
    net: totals.income - totals.expense - totals.repayment,
  };
}
