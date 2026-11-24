import assert from "node:assert/strict";
import { test } from "node:test";
import { testDb } from "./db-adapter.ts";

test("업데이트 시각은 기존 저장 시각을 불러오고 성공한 데이터 변경에 따라 갱신된다", (t) => {
  const { sql, close } = testDb((legacy) => {
    legacy.exec(`
      INSERT INTO accounts(id,alias,institution,account_type,tracking_start_date,created_at,updated_at)
      VALUES ('cash','현금','가상','cash','2026-11-01','2026-11-02T10:00:00.000Z','2026-11-04T10:00:00.000Z'),
             ('savings','적금','가상','savings','2026-11-01','2026-11-02T10:00:00.000Z','2026-11-02T10:00:00.000Z');
      INSERT INTO ledger_transactions(id,occurred_on,kind,amount_krw,account_id,created_at)
      VALUES ('legacy','2026-11-02','expense',1000,'cash','2026-11-04 11:00:00');
    `);
  });
  t.after(close);
  const read = () =>
    sql.prepare("SELECT updated_at FROM last_data_update WHERE id = 1").get()
      ?.updated_at;
  assert.equal(read(), "2026-11-04T11:00:00.000Z");

  for (const change of [
    `INSERT INTO accounts(id,alias,institution,account_type,tracking_start_date,created_at,updated_at)
     VALUES ('new','새 계좌','가상','cash','2026-11-01','','')`,
    "UPDATE accounts SET version = version + 1 WHERE id = 'cash'",
    `INSERT INTO ledger_transactions(id,occurred_on,kind,amount_krw,account_id)
     VALUES ('new','2026-11-02','expense',1000,'cash')`,
    "UPDATE ledger_transactions SET amount_krw = 2000 WHERE id = 'legacy'",
    "DELETE FROM ledger_transactions WHERE id = 'legacy'",
    `INSERT INTO recurring_savings(destination_id,effective_month,account_id,payment_day,amount_krw)
     VALUES ('savings','2026-11','cash',1,1000)`,
    "UPDATE recurring_savings SET amount_krw = 2000 WHERE destination_id = 'savings'",
    "DELETE FROM recurring_savings WHERE destination_id = 'savings'",
  ]) {
    sql.exec("UPDATE last_data_update SET updated_at = NULL");
    sql.exec(change);
    assert.match(
      String(read()),
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      change,
    );
  }

  sql.exec("UPDATE last_data_update SET updated_at = NULL");
  sql.exec("DELETE FROM ledger_transactions WHERE id = 'missing'");
  sql.exec("INSERT INTO login_attempts VALUES ('test', 1, 0)");
  sql.exec(
    "BEGIN; UPDATE accounts SET version = version + 1 WHERE id = 'cash'; ROLLBACK",
  );
  assert.equal(read(), null);
});
