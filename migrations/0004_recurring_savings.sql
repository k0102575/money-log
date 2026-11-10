CREATE TABLE recurring_savings (
  destination_id TEXT NOT NULL REFERENCES accounts(id),
  effective_month TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  payment_day INTEGER NOT NULL CHECK(payment_day BETWEEN 1 AND 31),
  amount_krw INTEGER NOT NULL CHECK(amount_krw BETWEEN 1 AND 9007199254740991),
  ends_on TEXT,
  PRIMARY KEY (destination_id, effective_month),
  CHECK(account_id <> destination_id)
);
