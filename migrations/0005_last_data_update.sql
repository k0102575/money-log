CREATE TABLE last_data_update (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  updated_at TEXT
);

-- Account saves already recorded their edit time. Older ledger rows only have creation times.
INSERT INTO last_data_update (id, updated_at)
SELECT 1, MAX(strftime('%Y-%m-%dT%H:%M:%fZ', recorded_at))
FROM (
  SELECT updated_at AS recorded_at FROM accounts
  UNION ALL
  SELECT created_at FROM ledger_transactions
);

CREATE TRIGGER last_data_update_account_insert AFTER INSERT ON accounts
BEGIN
  UPDATE last_data_update SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
END;

-- Balance and holding changes also increment the account version in the same transaction.
CREATE TRIGGER last_data_update_account_edit AFTER UPDATE OF version ON accounts
BEGIN
  UPDATE last_data_update SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
END;

CREATE TRIGGER last_data_update_ledger_insert AFTER INSERT ON ledger_transactions
BEGIN
  UPDATE last_data_update SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
END;

CREATE TRIGGER last_data_update_ledger_edit AFTER UPDATE ON ledger_transactions
BEGIN
  UPDATE last_data_update SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
END;

CREATE TRIGGER last_data_update_ledger_delete AFTER DELETE ON ledger_transactions
BEGIN
  UPDATE last_data_update SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
END;

CREATE TRIGGER last_data_update_recurring_insert AFTER INSERT ON recurring_savings
BEGIN
  UPDATE last_data_update SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
END;

CREATE TRIGGER last_data_update_recurring_edit AFTER UPDATE ON recurring_savings
BEGIN
  UPDATE last_data_update SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
END;

CREATE TRIGGER last_data_update_recurring_delete AFTER DELETE ON recurring_savings
BEGIN
  UPDATE last_data_update SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;
END;
