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
  funding_transfer_id?: string | null;
}

const savingsGroups: Partial<
  Record<Account["account_type"], "saving" | "isa" | "pension">
> = {
  savings: "saving",
  housing: "saving",
  isa: "isa",
  pension: "pension",
  irp: "pension",
};

export function suggestedTransferCategory(
  source?: Pick<Account, "account_type">,
  destination?: Pick<Account, "account_type">,
) {
  const group = destination && savingsGroups[destination.account_type];
  if (!group || (source && savingsGroups[source.account_type]))
    return "general";
  return group === "saving" ? "saving" : "investment";
}

export function displayTransferCategory(row: Transaction, accounts: Account[]) {
  if (row.category !== "saving" && row.category !== "investment")
    return "general";
  return suggestedTransferCategory(
    accounts.find((account) => account.id === row.account_id),
    accounts.find((account) => account.id === row.destination_id),
  );
}

export function contributionGroup(row: Transaction, accounts: Account[]) {
  if (
    row.kind !== "transfer" ||
    displayTransferCategory(row, accounts) === "general"
  )
    return;
  const destination = accounts.find(
    (account) => account.id === row.destination_id,
  );
  return destination && savingsGroups[destination.account_type];
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
