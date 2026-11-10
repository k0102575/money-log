ALTER TABLE account_observations
ADD COLUMN before_day_transactions INTEGER NOT NULL DEFAULT 0
CHECK(before_day_transactions IN (0, 1));
