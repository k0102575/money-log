import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboard } from "../app/lib/dashboard.ts";
import type { Account, Observation, Snapshot } from "../app/lib/domain.ts";
import type { Transaction } from "../app/lib/ledger.ts";

test("대시보드는 계산 잔액과 투자 순납입을 구분하고 초기치에 포함된 이체를 중복 계산하지 않는다", () => {
  const account = (id: string, type: Account["account_type"]): Account => ({
    id,
    alias: id,
    account_type: type,
    institution: "",
    tracking_start_date: "2026-11-01",
    note: "",
    holdings_status: "none",
    version: 1,
    archived_at: null,
    created_at: "",
    updated_at: "",
  });
  const observation = (
    id: string,
    metric: Observation["metric"],
    amount: number,
    date = "2026-11-01",
  ): Observation => ({
    id: id + metric,
    account_id: id,
    metric,
    amount_krw: amount,
    as_of_date: date,
    source: "app",
    source_note: "",
    precision: "exact",
    rounding_unit: "",
    revision_of: null,
    correction_reason: "",
    superseded_by: null,
    recorded_at: date,
  });
  const transfer = (
    id: string,
    source: string,
    destination: string,
    amount: number,
    date: string,
  ): Transaction => ({
    id,
    kind: "transfer",
    amount_krw: amount,
    occurred_on: date,
    account_id: source,
    destination_id: destination,
    category: "investment",
    note: "",
    version: 1,
  });
  const data: Snapshot = {
    asOf: "2026-11-12",
    generatedAt: "",
    accounts: [
      account("cash", "cma"),
      account("isa", "isa"),
      account("pension", "pension"),
      account("missing", "irp"),
    ],
    observations: [
      observation("cash", "cash_balance", 1000),
      observation("isa", "initial_contributions", 2000, "2026-11-05"),
      observation("isa", "initial_withdrawals", 0, "2026-11-05"),
      observation("pension", "initial_contributions", 3000),
      observation("pension", "initial_withdrawals", 500),
      observation("missing", "initial_contributions", 5000),
    ],
    products: [],
    quantities: [],
    transactions: [
      transfer("included", "cash", "isa", 100, "2026-11-05"),
      transfer("new", "cash", "isa", 200, "2026-11-06"),
      transfer("between", "isa", "pension", 300, "2026-11-07"),
      transfer("withdrawal", "pension", "cash", 50, "2026-11-08"),
    ],
  };
  const result = dashboard(data);
  assert.equal(result.totalBalance, "750");
  assert.equal(result.totalInvested, "4650");
  assert.deepEqual(
    result.investments.map((row) => row.amount),
    ["1900", "2750", null],
  );
  assert.equal(result.missingInvestments, 1);
  assert.equal(result.monthly.length, 1);
  assert.equal(result.monthly[0].month, "2026-11");
  assert.equal(result.totals.saved, "300");
  assert.deepEqual(result.monthly[0], {
    month: "2026-11",
    saving: "0",
    isa: "300",
    pension: "0",
    total: "300",
  });
  const classified = dashboard({
    ...data,
    accounts: [
      ...data.accounts,
      account("housing", "housing"),
      account("bank", "checking"),
    ],
    transactions: [
      {
        ...transfer("to-bank", "cash", "bank", 500, "2026-11-09"),
        category: "general",
      },
      {
        ...transfer("saving", "bank", "housing", 100, "2026-11-10"),
        category: "saving",
      },
      transfer("isa", "cash", "isa", 200, "2026-11-10"),
      transfer("pension", "cash", "pension", 300, "2026-11-10"),
      transfer("irp", "cash", "missing", 400, "2026-11-10"),
      transfer("reallocation", "isa", "pension", 500, "2026-11-10"),
      {
        ...transfer("ordinary", "cash", "isa", 600, "2026-11-10"),
        category: "general",
      },
      transfer("withdrawal", "isa", "cash", 700, "2026-11-10"),
    ],
  });
  assert.deepEqual(classified.monthly[0], {
    month: "2026-11",
    saving: "100",
    isa: "200",
    pension: "700",
    total: "1000",
  });
  assert.equal(classified.totals.saved, "1000");
  // A missing initial withdrawal value must never be treated as zero.
  assert.equal(result.investments[2].amount, null);
  const empty = dashboard({
    ...data,
    accounts: [],
    observations: [],
    transactions: [],
  });
  assert.equal(empty.totalBalance, "0");
  assert.deepEqual(empty.recent, []);
});
