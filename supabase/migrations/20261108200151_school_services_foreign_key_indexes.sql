-- Cover every referencing FK added by the CORNHILL Services foundation.
create index if not exists school_admission_enquiries_reviewed_by_idx on public.school_admission_enquiries(reviewed_by);
create index if not exists school_hr_leave_requests_decided_by_idx on public.school_hr_leave_requests(decided_by);
create index if not exists school_learning_resources_created_by_idx on public.school_learning_resources(created_by);
create index if not exists school_library_books_created_by_idx on public.school_library_books(created_by);
create index if not exists school_library_loans_book_id_idx on public.school_library_loans(book_id);
create index if not exists school_library_loans_issued_by_idx on public.school_library_loans(issued_by);
create index if not exists school_library_loans_returned_by_idx on public.school_library_loans(returned_by);
create index if not exists school_payroll_records_created_by_idx on public.school_payroll_records(created_by);
create index if not exists school_provider_integrations_updated_by_idx on public.school_provider_integrations(updated_by);
create index if not exists school_transport_assignments_created_by_idx on public.school_transport_assignments(created_by);
create index if not exists school_transport_routes_created_by_idx on public.school_transport_routes(created_by);
create index if not exists school_transport_routes_driver_user_id_idx on public.school_transport_routes(driver_user_id);
create index if not exists school_welfare_cases_created_by_idx on public.school_welfare_cases(created_by);
