import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceHistory } from "../app/lib/balance.ts";
import type { Observation } from "../app/lib/domain.ts";
import type { Transaction } from "../app/lib/ledger.ts";

test("CMA 확인일에 차이를 계산하고 다음 날 거래부터 새 잔액에 반영한다", () => {
  const observation = (date: string, amount: number): Observation => ({
    id: date,
    account_id: "cma",
    metric: "cash_balance",
    amount_krw: amount,
    as_of_date: date,
    recorded_at: date,
    superseded_by: null,
    source: "app",
    precision: "exact",
    rounding_unit: "",
    source_note: "",
    revision_of: null,
    correction_reason: "",
  });
  const transaction = (
    date: string,
    kind: Transaction["kind"],
    amount: number,
    from = "cma",
    to: string | null = null,
  ): Transaction => ({
    id: date + kind,
    occurred_on: date,
    kind,
    amount_krw: amount,
    account_id: from,
    destination_id: to,
    category: "",
    note: "",
    version: 1,
  });
  const rows = [
    transaction("2026-11-09", "income", 10000),
    transaction("2026-11-10", "transfer", 2000, "cma", "bank"),
    transaction("2026-11-11", "transfer", 3000, "bank", "cma"),
    transaction("2026-11-12", "repayment", 1000),
  ];
  const confirmations = [
    observation("2026-10-27", 1000),
    observation("2026-11-10", 9100),
  ];
  const result = balanceHistory("cma", confirmations, rows, "2026-11-11", true);
  assert.equal(result.calculated, "12100");
  assert.deepEqual(result.adjustments, [
    {
      date: "2026-11-10",
      previousDate: "2026-10-27",
      expected: "9000",
      confirmed: 9100,
      difference: "100",
      partial: true,
    },
  ]);
  assert.equal(
    balanceHistory("cma", confirmations, rows, "2026-11-12", false).calculated,
    "11100",
  );
  assert.deepEqual(
    balanceHistory("cma", confirmations, rows, "2026-11-12", false).adjustments,
    [],
  );
  assert.equal(
    balanceHistory("bank", confirmations, rows, "2026-11-12", false).calculated,
    null,
  );
  const beforeTransfer = [
    confirmations[0],
    { ...confirmations[1], before_day_transactions: 1 },
  ];
  const sameDay = balanceHistory(
    "cma",
    beforeTransfer,
    rows,
    "2026-11-10",
    true,
  );
  assert.equal(sameDay.calculated, "7100");
  assert.equal(sameDay.adjustments[0]?.expected, "11000");
  assert.equal(
    balanceHistory("cma", beforeTransfer, rows, "2026-11-11", true).calculated,
    "10100",
  );
});
