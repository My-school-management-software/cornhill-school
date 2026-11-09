revoke select on table public.class_login_directory from anon;
grant select (class_key, class_label, teacher_name, administrator_name, display_order)
on table public.class_login_directory to anon;
comment on table public.class_login_directory is 'Public sign-in display directory only. Anonymous users may read class key/label, teacher display name, administrator display name and display order; no teacher credentials or private staff fields are stored here.';
