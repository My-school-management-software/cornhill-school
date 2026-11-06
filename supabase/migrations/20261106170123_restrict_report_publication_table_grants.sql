revoke all privileges on table public.report_card_publications from anon, authenticated;
grant select, insert, update on table public.report_card_publications to authenticated;
