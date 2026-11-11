create policy "Finance operators read daily collection records"
on public.daily_collection_records
for select
to authenticated
using (public.is_school_finance_operator());