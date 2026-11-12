import { balanceHistory } from "./balance.ts";
import {
  current,
  isInvestment,
  type Account,
  type Snapshot,
} from "./domain.ts";
import { contributionGroup, ledgerStart, ledgerSummary } from "./ledger.ts";

function accountOrder(account: Account) {
  if (account.account_type === "checking") {
    const name = account.institution + account.alias;
    if (name.includes("신한")) return 1;
    if (name.includes("하나")) return 2;
    return 3;
  }
  const order: Partial<Record<Account["account_type"], number>> = {
    cma: 0,
    savings: 4,
    housing: 5,
    isa: 6,
    pension: 7,
    irp: 8,
  };
  return order[account.account_type] ?? 9;
}

export function dashboard(data: Snapshot) {
  const accounts = data.accounts
    .filter((account) => !account.archived_at)
    .sort((a, b) => accountOrder(a) - accountOrder(b));
  const transactions = data.transactions ?? [];
  const names = new Map(
    data.accounts.map((account) => [account.id, account.alias]),
  );
  const balances = accounts
    .filter((account) => !isInvestment(account.account_type))
    .map((account) => ({
      id: account.id,
      name: account.alias,
      type: account.account_type,
      ...balanceHistory(
        account.id,
        data.observations,
        transactions,
        data.asOf,
        false,
      ),
    }));
  const investments = accounts
    .filter((account) => isInvestment(account.account_type))
    .map((account) => {
      const observations = data.observations.filter(
        (row) => row.account_id === account.id,
      );
      const contributions = current(
        observations.filter((row) => row.metric === "initial_contributions"),
        data.asOf,
      );
      const withdrawals = current(
        observations.filter((row) => row.metric === "initial_withdrawals"),
        data.asOf,
      );
      let amount: bigint | null = null;
      if (
        contributions &&
        withdrawals &&
        contributions.as_of_date === withdrawals.as_of_date &&
        contributions.as_of_date >= "2026-10-31"
      ) {
        amount =
          BigInt(contributions.amount_krw) - BigInt(withdrawals.amount_krw);
        for (const row of transactions) {
          if (
            row.kind !== "transfer" ||
            row.occurred_on <= contributions.as_of_date ||
            row.occurred_on > data.asOf
          )
            continue;
          if (row.destination_id === account.id)
            amount += BigInt(row.amount_krw);
          if (row.account_id === account.id) amount -= BigInt(row.amount_krw);
        }
      }
      return {
        id: account.id,
        name: account.alias,
        amount: amount?.toString() ?? null,
        baseDate: contributions?.as_of_date ?? null,
      };
    });
  const totalBalance = balances.reduce(
    (sum, row) => sum + BigInt(row.calculated ?? "0"),
    0n,
  );
  const totalInvested = investments.reduce(
    (sum, row) => sum + BigInt(row.amount ?? "0"),
    0n,
  );
  const month = data.asOf.slice(0, 7);
  const totals = ledgerSummary(
    transactions.filter((row) => row.occurred_on.startsWith(month)),
  );
  // Only plot months covered by the ledger, including a zero month with no input.
  const months: string[] = [];
  const [year, number] = month.split("-").map(Number);
  for (let offset = 5; offset >= 0; offset--) {
    const value = new Date(Date.UTC(year, number - 1 - offset, 1))
      .toISOString()
      .slice(0, 7);
    if (value >= ledgerStart.slice(0, 7)) months.push(value);
  }
  const contributions = transactions.filter(
    (row) =>
      contributionGroup(row, data.accounts) && row.occurred_on <= data.asOf,
  );
  const monthly = months.map((value) => {
    const sums = { saving: 0n, isa: 0n, pension: 0n };
    for (const row of contributions) {
      if (!row.occurred_on.startsWith(value)) continue;
      const group = contributionGroup(row, data.accounts);
      if (group) sums[group] += BigInt(row.amount_krw);
    }
    return {
      month: value,
      saving: sums.saving.toString(),
      isa: sums.isa.toString(),
      pension: sums.pension.toString(),
      total: (sums.saving + sums.isa + sums.pension).toString(),
    };
  });
  const recent = transactions
    .filter((row) => row.occurred_on <= data.asOf)
    .sort(
      (a, b) =>
        b.occurred_on.localeCompare(a.occurred_on) || b.id.localeCompare(a.id),
    )
    .slice(0, 4)
    .map((row) => ({
      ...row,
      accountName: names.get(row.account_id),
      destinationName: row.destination_id
        ? names.get(row.destination_id)
        : null,
    }));
  return {
    balances,
    investments,
    monthly,
    recent,
    month,
    totalBalance: totalBalance.toString(),
    totalInvested: totalInvested.toString(),
    missingBalances: balances.filter((row) => row.calculated === null).length,
    missingInvestments: investments.filter((row) => row.amount === null).length,
    partialBalances: balances.some((row) => row.partial),
    totals: {
      income: totals.income.toString(),
      expense: totals.expense.toString(),
      repayment: totals.repayment.toString(),
      saved: monthly.find((row) => row.month === month)?.total ?? "0",
    },
  };
}
