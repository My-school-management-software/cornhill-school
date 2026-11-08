alter table public.user_profiles
  add column if not exists staff_category text
    check (staff_category in ('Teaching', 'Non-teaching')),
  add column if not exists gender text
    check (gender in ('Male', 'Female', 'Other', 'Prefer not to say'));
