-- Lock bank transactions to guarded RPCs and database evidence-review triggers.
-- The banking UI uses these functions for every state change; it does not write
-- to school_bank_transactions directly. This prevents direct INSERT/UPDATE from
-- bypassing ten-minute evidence requests, approval requirements and audit events.

drop policy if exists "Bank transactions finance operator insert own" on public.school_bank_transactions;
drop policy if exists "Bank transactions admin update" on public.school_bank_transactions;

revoke all privileges on table public.school_bank_transactions from public, anon, authenticated;
grant select on table public.school_bank_transactions to authenticated;

-- Keep read access controlled by the existing finance-operator SELECT policy.
-- Writes remain available to the table owner inside SECURITY DEFINER functions:
-- create_school_bank_transaction, approve_school_bank_withdrawal,
-- reject_school_bank_withdrawal, reissue_school_bank_evidence and evidence-review triggers.
