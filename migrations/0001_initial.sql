PRAGMA foreign_keys = ON;
CREATE TABLE accounts (
 id TEXT PRIMARY KEY, alias TEXT NOT NULL, institution TEXT NOT NULL,
 account_type TEXT NOT NULL CHECK(account_type IN ('checking','cma','isa','irp','pension','savings','housing','cash','other')),
 tracking_start_date TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 holdings_status TEXT NOT NULL DEFAULT 'unknown' CHECK(holdings_status IN ('unknown','some','none')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), archived_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE account_observations (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
 metric TEXT NOT NULL CHECK(metric IN ('cash_balance','initial_contributions','initial_withdrawals','valuation')),
 amount_krw INTEGER NOT NULL CHECK(typeof(amount_krw)='integer' AND amount_krw BETWEEN 0 AND 9007199254740991),
 as_of_date TEXT NOT NULL, source TEXT NOT NULL, source_note TEXT NOT NULL DEFAULT '',
 precision TEXT NOT NULL CHECK(precision IN ('exact','estimated','rounded')), rounding_unit TEXT NOT NULL DEFAULT '',
 revision_of TEXT REFERENCES account_observations(id), correction_reason TEXT NOT NULL DEFAULT '',
 superseded_by TEXT, recorded_at TEXT NOT NULL
);
CREATE UNIQUE INDEX account_observations_current ON account_observations(account_id,metric,as_of_date) WHERE superseded_by IS NULL;
CREATE INDEX account_observations_dates ON account_observations(account_id,as_of_date);
CREATE TABLE investment_products (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), name TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE product_observations (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES investment_products(id), quantity_decimal TEXT NOT NULL,
 as_of_date TEXT NOT NULL, risk_class TEXT CHECK(risk_class IN ('risk','safe','unknown')),
 revision_of TEXT REFERENCES product_observations(id), correction_reason TEXT NOT NULL DEFAULT '',
 superseded_by TEXT, recorded_at TEXT NOT NULL
);
CREATE UNIQUE INDEX product_observations_current ON product_observations(product_id,as_of_date) WHERE superseded_by IS NULL;
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, csrf_token TEXT NOT NULL,
 expires_at TEXT NOT NULL, auth_version TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE login_attempts (
 ip_hash TEXT PRIMARY KEY, failures INTEGER NOT NULL, window_start INTEGER NOT NULL
);
CREATE TABLE reports (
 id TEXT PRIMARY KEY, as_of_date TEXT NOT NULL, generated_at TEXT NOT NULL,
 template_version TEXT NOT NULL, input_snapshot TEXT NOT NULL, markdown TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','saved')), session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
 draft_expires_at TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE
);
CREATE INDEX reports_saved ON reports(status,generated_at);
