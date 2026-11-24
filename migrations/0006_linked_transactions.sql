ALTER TABLE ledger_transactions
  ADD COLUMN funding_transfer_id TEXT REFERENCES ledger_transactions(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

CREATE UNIQUE INDEX ledger_funding_transfer ON ledger_transactions(funding_transfer_id)
  WHERE funding_transfer_id IS NOT NULL;

UPDATE ledger_transactions AS payment
SET funding_transfer_id = CASE
  WHEN payment.id LIKE 'funded-expense:%' THEN substr(payment.id, length('funded-expense:') + 1)
  ELSE 'funding:' || payment.id
END
WHERE (payment.id LIKE 'funded-expense:%' OR payment.id LIKE 'saving:%')
  AND EXISTS (
    SELECT 1 FROM ledger_transactions AS funding
    WHERE funding.id = CASE
      WHEN payment.id LIKE 'funded-expense:%' THEN substr(payment.id, length('funded-expense:') + 1)
      ELSE 'funding:' || payment.id
    END
      AND funding.kind = 'transfer'
  );
