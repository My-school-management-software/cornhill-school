alter table public.school_payments
  add column if not exists payer_name text;
