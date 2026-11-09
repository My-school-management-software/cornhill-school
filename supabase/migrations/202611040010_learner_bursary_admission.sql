-- Bursary learners retain an ordinary learner account and payment/receipt trail.
alter table public.students
  add column if not exists is_bursary boolean not null default false,
  add column if not exists bursary_fee_ugx bigint not null default 0,
  add column if not exists bursary_notes text;

alter table public.students drop constraint if exists students_bursary_fee_nonnegative;
alter table public.students add constraint students_bursary_fee_nonnegative check (bursary_fee_ugx >= 0);

create or replace function public.create_bursary_admission_charge()
returns trigger language plpgsql security invoker set search_path = public, auth
as $$
begin
  if new.is_bursary then
    if new.bursary_fee_ugx <= 0 then
      raise exception 'A bursary learner must have an approved fee amount greater than zero';
    end if;
    if auth.uid() is null then
      raise exception 'An authenticated administrator is required to create a bursary admission charge';
    end if;
    insert into public.learner_charges(student_id, description, amount_ugx, created_by)
    values (new.id, 'Approved bursary fee — ' || coalesce(nullif(btrim(new.bursary_notes),''),'admission'), new.bursary_fee_ugx, auth.uid());
  elsif new.bursary_fee_ugx <> 0 then
    raise exception 'Regular-fee learners cannot have a bursary amount';
  end if;
  return new;
end;
$$;

drop trigger if exists students_create_bursary_charge on public.students;
create trigger students_create_bursary_charge after insert on public.students
for each row execute function public.create_bursary_admission_charge();

comment on column public.students.is_bursary is 'Whether this learner has an approved bursary fee arrangement.';
comment on column public.students.bursary_fee_ugx is 'Total approved amount payable for the bursary admission charge, in UGX.';
comment on column public.students.bursary_notes is 'Administrative bursary approval or sponsor note; do not store sensitive personal details.';
