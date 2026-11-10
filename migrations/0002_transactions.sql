CREATE TABLE ledger_transactions (
  id TEXT PRIMARY KEY,
  occurred_on TEXT NOT NULL CHECK(occurred_on >= '2026-11-01'),
  kind TEXT NOT NULL CHECK(kind IN ('income','expense','transfer','repayment')),
  amount_krw INTEGER NOT NULL CHECK(typeof(amount_krw)='integer' AND amount_krw BETWEEN 1 AND 9007199254740991),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  destination_id TEXT REFERENCES accounts(id),
  category TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(
    (kind='transfer' AND destination_id IS NOT NULL AND destination_id<>account_id
      AND category IN ('general','saving','investment'))
    OR (kind<>'transfer' AND destination_id IS NULL)
  )
);
CREATE INDEX ledger_transactions_by_date ON ledger_transactions(occurred_on DESC, created_at DESC);
