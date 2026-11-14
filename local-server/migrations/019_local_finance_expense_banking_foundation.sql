-- CORNHILL local expense and banking ledger foundation.
-- Additive only: no hosted database or school production data is changed.
BEGIN;

INSERT INTO cornhill_auth.permission_catalog(permission_code,category,description,high_risk)
VALUES
 ('finance.expenses_request','finance','Submit and manage own expense requests within assigned daily limits.',true),
 ('finance.expenses_review','finance','Independently approve or reject expense requests.',true),
 ('finance.expenses_post','finance','Post an approved and evidenced expense to the immutable expense ledger.',true),
 ('finance.banking_manage','finance','Create bank transaction requests and maintain bank account metadata.',true),
 ('finance.banking_review','finance','Independently review bank deposits and withdrawals.',true),
 ('finance.banking_verify','finance','Verify evidenced bank transactions and post them to the bank ledger.',true)
ON CONFLICT(permission_code) DO NOTHING;

CREATE TABLE cornhill_school.expense_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category_code text NOT NULL UNIQUE CHECK(category_code ~ '^[A-Z0-9_]{2,32}$'),
 category_name text NOT NULL CHECK(length(btrim(category_name)) BETWEEN 2 AND 100),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO cornhill_school.expense_categories(category_code,category_name) VALUES
 ('UTILITIES','Utilities'),('FOOD','Food and kitchen'),('STATIONERY','Stationery'),
 ('MAINTENANCE','Repairs and maintenance'),('TRANSPORT','Transport'),('MEDICAL','Medical and welfare'),
 ('OTHER','Other approved school expenses')
ON CONFLICT(category_code) DO NOTHING;

CREATE TABLE cornhill_school.finance_operator_limits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 staff_account_id uuid NOT NULL UNIQUE REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 daily_limit_ugx bigint NOT NULL CHECK(daily_limit_ugx > 0),
 is_active boolean NOT NULL DEFAULT true,
 updated_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cornhill_school.expense_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_number text NOT NULL UNIQUE,
 category_id uuid NOT NULL REFERENCES cornhill_school.expense_categories(id) ON DELETE RESTRICT,
 requested_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 5 AND 500),
 amount_ugx bigint NOT NULL CHECK(amount_ugx > 0),
 expense_date date NOT NULL DEFAULT (timezone('Africa/Kampala',now()))::date,
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected','Posted','Cancelled')),
 reviewed_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 reviewed_at timestamptz,
 review_note text CHECK(review_note IS NULL OR length(review_note)<=500),
 evidence_request_id uuid REFERENCES cornhill_school.evidence_capture_requests(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status IN ('Approved','Rejected','Posted') AND reviewed_by_staff_id IS NOT NULL AND reviewed_at IS NOT NULL)
       OR status NOT IN ('Approved','Rejected','Posted')),
 CHECK(reviewed_by_staff_id IS NULL OR reviewed_by_staff_id<>requested_by_staff_id)
);
CREATE INDEX expense_requests_operator_day_idx
 ON cornhill_school.expense_requests(requested_by_staff_id,expense_date,status);
CREATE INDEX expense_requests_review_queue_idx
 ON cornhill_school.expense_requests(status,created_at) WHERE status='Pending';

CREATE TABLE cornhill_school.expense_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 expense_request_id uuid NOT NULL UNIQUE REFERENCES cornhill_school.expense_requests(id) ON DELETE RESTRICT,
 category_id uuid NOT NULL REFERENCES cornhill_school.expense_categories(id) ON DELETE RESTRICT,
 amount_ugx bigint NOT NULL CHECK(amount_ugx>0),
 description text NOT NULL,
 expense_date date NOT NULL,
 posted_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 posted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expense_ledger_date_idx ON cornhill_school.expense_ledger(expense_date DESC,posted_at DESC);

CREATE TABLE cornhill_school.expense_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 expense_request_id uuid NOT NULL REFERENCES cornhill_school.expense_requests(id) ON DELETE RESTRICT,
 actor_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 event_code text NOT NULL CHECK(event_code IN ('expense.requested','expense.approved','expense.rejected','expense.posted','expense.cancelled')),
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expense_request_events_request_idx ON cornhill_school.expense_request_events(expense_request_id,occurred_at DESC);

CREATE TABLE cornhill_school.bank_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_name text NOT NULL CHECK(length(btrim(account_name)) BETWEEN 2 AND 120),
 bank_name text NOT NULL CHECK(length(btrim(bank_name)) BETWEEN 2 AND 120),
 account_number_last4 char(4) NOT NULL CHECK(account_number_last4 ~ '^[0-9]{4}$'),
 currency char(3) NOT NULL DEFAULT 'UGX' CHECK(currency='UGX'),
 opening_balance_ugx bigint NOT NULL DEFAULT 0 CHECK(opening_balance_ugx>=0),
 is_active boolean NOT NULL DEFAULT true,
 created_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cornhill_school.bank_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bank_account_id uuid NOT NULL REFERENCES cornhill_school.bank_accounts(id) ON DELETE RESTRICT,
 transaction_type text NOT NULL CHECK(transaction_type IN ('Deposit','Withdrawal')),
 amount_ugx bigint NOT NULL CHECK(amount_ugx>0),
 external_reference text CHECK(external_reference IS NULL OR length(external_reference)<=120),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 5 AND 500),
 transaction_date date NOT NULL DEFAULT (timezone('Africa/Kampala',now()))::date,
 requested_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected','Verified')),
 reviewed_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 reviewed_at timestamptz,
 review_note text CHECK(review_note IS NULL OR length(review_note)<=500),
 evidence_request_id uuid REFERENCES cornhill_school.evidence_capture_requests(id) ON DELETE RESTRICT,
 verified_by_staff_id uuid REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status IN ('Approved','Rejected','Verified') AND reviewed_by_staff_id IS NOT NULL AND reviewed_at IS NOT NULL)
       OR status NOT IN ('Approved','Rejected','Verified')),
 CHECK(reviewed_by_staff_id IS NULL OR reviewed_by_staff_id<>requested_by_staff_id),
 CHECK((status='Verified' AND verified_by_staff_id IS NOT NULL AND verified_at IS NOT NULL)
       OR (status<>'Verified' AND verified_by_staff_id IS NULL AND verified_at IS NULL))
);
CREATE INDEX bank_transactions_account_status_idx
 ON cornhill_school.bank_transactions(bank_account_id,status,transaction_date DESC);
CREATE UNIQUE INDEX bank_transactions_external_reference_unique
 ON cornhill_school.bank_transactions(bank_account_id,external_reference)
 WHERE external_reference IS NOT NULL;

CREATE TABLE cornhill_school.bank_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bank_transaction_id uuid NOT NULL UNIQUE REFERENCES cornhill_school.bank_transactions(id) ON DELETE RESTRICT,
 bank_account_id uuid NOT NULL REFERENCES cornhill_school.bank_accounts(id) ON DELETE RESTRICT,
 transaction_type text NOT NULL CHECK(transaction_type IN ('Deposit','Withdrawal')),
 amount_ugx bigint NOT NULL CHECK(amount_ugx>0),
 signed_amount_ugx bigint NOT NULL,
 transaction_date date NOT NULL,
 verified_by_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 verified_at timestamptz NOT NULL,
 CHECK((transaction_type='Deposit' AND signed_amount_ugx=amount_ugx) OR
       (transaction_type='Withdrawal' AND signed_amount_ugx=-amount_ugx))
);
CREATE INDEX bank_ledger_account_date_idx ON cornhill_school.bank_ledger(bank_account_id,transaction_date DESC,verified_at DESC);

CREATE TABLE cornhill_school.bank_transaction_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bank_transaction_id uuid NOT NULL REFERENCES cornhill_school.bank_transactions(id) ON DELETE RESTRICT,
 actor_staff_id uuid NOT NULL REFERENCES cornhill_auth.staff_accounts(id) ON DELETE RESTRICT,
 event_code text NOT NULL CHECK(event_code IN ('bank_transaction.requested','bank_transaction.approved','bank_transaction.rejected','bank_transaction.verified')),
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_transaction_events_request_idx ON cornhill_school.bank_transaction_events(bank_transaction_id,occurred_at DESC);

CREATE OR REPLACE FUNCTION cornhill_school.prevent_expense_banking_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog
AS $fn$
BEGIN
 RAISE EXCEPTION 'Expense and bank ledger/event history is append-only' USING ERRCODE='55000';
END $fn$;
REVOKE ALL ON FUNCTION cornhill_school.prevent_expense_banking_history_mutation() FROM PUBLIC;
CREATE TRIGGER expense_ledger_immutable BEFORE UPDATE OR DELETE ON cornhill_school.expense_ledger
 FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_expense_banking_history_mutation();
CREATE TRIGGER expense_request_events_immutable BEFORE UPDATE OR DELETE ON cornhill_school.expense_request_events
 FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_expense_banking_history_mutation();
CREATE TRIGGER bank_ledger_immutable BEFORE UPDATE OR DELETE ON cornhill_school.bank_ledger
 FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_expense_banking_history_mutation();
CREATE TRIGGER bank_transaction_events_immutable BEFORE UPDATE OR DELETE ON cornhill_school.bank_transaction_events
 FOR EACH ROW EXECUTE FUNCTION cornhill_school.prevent_expense_banking_history_mutation();

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA cornhill_school FROM cornhill_finance_runtime,cornhill_finance_api;

COMMIT;
