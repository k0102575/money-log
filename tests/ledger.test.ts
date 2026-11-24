import { test } from "node:test";
import assert from "node:assert/strict";
import { testDb } from "./db-adapter.ts";
import { createAccount, snapshot } from "../app/lib/db.server.ts";
import {
  deleteTransaction,
  saveTransaction,
  saveTransferThenExpense,
} from "../app/lib/ledger.server.ts";
import { ledgerSummary } from "../app/lib/ledger.ts";
import { makeMarkdown } from "../app/lib/report.ts";

function form(values: Record<string, string | number>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values))
    data.set(key, String(value));
  return data;
}

test("월별 거래는 실제 거래일로 집계하며 이체와 확인 잔액을 분리한다", async () => {
  const { db, close } = testDb();
  try {
    const account = await createAccount(
      db,
      form({
        alias: "입출금",
        institution: "테스트 은행",
        account_type: "checking",
        tracking_start_date: "2026-11-09",
      }),
    );
    const savings = await createAccount(
      db,
      form({
        alias: "적금",
        institution: "테스트 은행",
        account_type: "savings",
        tracking_start_date: "2026-11-09",
      }),
    );
    const base = { account_id: account, occurred_on: "2026-11-03" };
    const salary = {
      ...base,
      request_key: crypto.randomUUID(),
      kind: "income",
      amount: "1,000,000",
    };
    await saveTransaction(db, form(salary));
    await saveTransaction(db, form(salary));
    await saveTransaction(
      db,
      form({
        ...base,
        request_key: crypto.randomUUID(),
        kind: "transfer",
        amount: 100000,
        destination_id: savings,
        transfer_category: "saving",
      }),
    );
    const expenseId = crypto.randomUUID();
    const expense = {
      ...base,
      request_key: expenseId,
      kind: "expense",
      amount: 90000,
      category: "온누리 충전",
    };
    await saveTransaction(db, form(expense));
    await saveTransaction(
      db,
      form({
        ...expense,
        transaction_id: expenseId,
        version: 1,
        amount: 80000,
      }),
    );
    await assert.rejects(() =>
      deleteTransaction(db, form({ transaction_id: expenseId, version: 1 })),
    );
    await assert.rejects(() =>
      saveTransaction(db, form({ ...salary, occurred_on: "2026-10-31" })),
    );

    const data = await snapshot(db, "2026-11-10", true);
    assert.equal(data.transactions?.length, 3);
    assert.deepEqual(data.observations, []);
    assert.deepEqual(ledgerSummary(data.transactions!), {
      income: 1000000n,
      expense: 80000n,
      repayment: 0n,
      transfer: 100000n,
      saving: 100000n,
      investment: 0n,
      net: 920000n,
    });
    const markdown = makeMarkdown(data);
    assert.match(markdown, /\| 수입 \| 1,000,000원 \|/);
    assert.match(markdown, /집계 기간: 2026-11-01 ~ 2026-11-10/);
    assert.equal(
      (await snapshot(db, "2026-11-02", true)).transactions?.length,
      0,
    );
    await deleteTransaction(
      db,
      form({ transaction_id: expenseId, version: 2 }),
    );
    assert.equal(
      (await snapshot(db, "2026-11-10", true)).transactions?.length,
      2,
    );
  } finally {
    close();
  }
});

test("이체 후 지출은 한 번만 저장하고 계좌이체와 소비를 따로 집계한다", async (t) => {
  const { db, sql, close } = testDb();
  t.after(close);
  sql.exec(`INSERT INTO accounts(id,alias,institution,account_type,tracking_start_date,created_at,updated_at)
    VALUES ('cma','CMA','','cma','2026-11-01','',''),('bank','신한','','checking','2026-11-01','','')`);
  const entry = {
    request_key: crypto.randomUUID(),
    occurred_on: "2026-11-03",
    account_id: "cma",
    destination_id: "bank",
    amount: "7,890",
    category: "멤버십",
  };
  await Promise.all([
    saveTransferThenExpense(db, form(entry)),
    saveTransferThenExpense(db, form(entry)),
  ]);
  await saveTransferThenExpense(
    db,
    form({
      ...entry,
      request_key: crypto.randomUUID(),
      amount: "10,000",
    }),
  );
  await assert.rejects(
    saveTransferThenExpense(
      db,
      form({
        ...entry,
        request_key: crypto.randomUUID(),
        destination_id: "missing",
      }),
    ),
  );
  const { transactions } = await snapshot(db, "2026-11-03", "all");
  assert.equal(transactions?.length, 4);
  assert.equal(ledgerSummary(transactions ?? []).expense, 17890n);
  assert.equal(ledgerSummary(transactions ?? []).transfer, 17890n);
  assert.ok(
    transactions
      ?.filter((row) => row.kind === "expense")
      .every((row) => row.account_id === "bank" && row.category === "멤버십"),
  );
});

test("기존 이체를 연결하면 금액이 중복되지 않고 연결한 두 건을 함께 삭제할 수 있다", async (t) => {
  const { db, sql, close } = testDb();
  t.after(close);
  sql.exec(`
    INSERT INTO accounts(id,alias,institution,account_type,tracking_start_date,created_at,updated_at)
    VALUES ('cma','CMA','','cma','2026-11-01','',''),('bank','하나','','checking','2026-11-01','','')
  `);
  const input = {
    occurred_on: "2026-11-03",
    account_id: "cma",
    destination_id: "bank",
    amount: "7890",
  };
  const transferId = crypto.randomUUID();
  const requestKey = crypto.randomUUID();
  await saveTransaction(
    db,
    form({
      ...input,
      kind: "transfer",
      transfer_category: "general",
      request_key: transferId,
    }),
  );
  await assert.rejects(
    saveTransferThenExpense(db, form({ ...input, request_key: requestKey })),
    /같은 날짜/,
  );
  await saveTransferThenExpense(
    db,
    form({ ...input, request_key: requestKey, funding_choice: transferId }),
  );
  const expenseId = `funded-expense:${requestKey}`;
  const currentRows = () =>
    sql.prepare("SELECT * FROM ledger_transactions").all();
  assert.equal(currentRows().length, 2);
  assert.equal(
    currentRows().find((row) => row.kind === "expense")?.funding_transfer_id,
    transferId,
  );
  const deletion = {
    transaction_id: expenseId,
    version: 1,
    linked_id: transferId,
    linked_version: 1,
    delete_linked: "yes",
  };
  await assert.rejects(
    deleteTransaction(db, form({ ...deletion, linked_version: 2 })),
    /변경/,
  );
  assert.equal(currentRows().length, 2);
  await deleteTransaction(db, form(deletion));
  assert.equal(currentRows().length, 0);
});
