alter table public.school_payments add column if not exists collection_item text not null default 'School fees';
create table if not exists public.daily_collection_records (
 collection_date date primary key, record_no text not null unique,
 posted_receipt_count integer not null default 0, total_received_ugx bigint not null default 0,
 reversed_receipt_count integer not null default 0, reversed_total_ugx bigint not null default 0,
 totals_by_item jsonb not null default '{}'::jsonb, entries jsonb not null default '[]'::jsonb,
 generated_at timestamptz not null default now(), generated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now()
);
alter table public.daily_collection_records enable row level security;
revoke all privileges on table public.daily_collection_records from public,anon,authenticated;
grant select,insert,update on table public.daily_collection_records to authenticated;
drop policy if exists "Administrators manage daily collection records" on public.daily_collection_records;
create policy "Administrators manage daily collection records" on public.daily_collection_records for all to authenticated using (public.is_school_admin()) with check (public.is_school_admin());

create or replace function public.refresh_daily_collection_record(p_date date)
returns void language plpgsql set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
 if v_uid is null or not coalesce(public.is_school_admin(),false) then raise exception 'Only school administrators may refresh daily collection records' using errcode='42501'; end if;
 if p_date is null then raise exception 'A collection date is required'; end if;
 insert into public.daily_collection_records(collection_date,record_no,posted_receipt_count,total_received_ugx,reversed_receipt_count,reversed_total_ugx,totals_by_item,entries,generated_at,generated_by,updated_at)
 select p_date,'DCR-'||to_char(p_date,'YYYYMMDD'),
 count(*) filter(where p.status='Posted')::integer,
 coalesce(sum(p.amount_ugx) filter(where p.status='Posted'),0)::bigint,
 count(*) filter(where p.status='Reversed')::integer,
 coalesce(sum(p.amount_ugx) filter(where p.status='Reversed'),0)::bigint,
 coalesce((select jsonb_object_agg(x.item_name,x.item_total) from (
   select coalesce(nullif(trim(px.collection_item),''),'Unspecified') item_name,sum(px.amount_ugx)::bigint item_total
   from public.school_payments px where timezone('Africa/Kampala',px.received_at)::date=p_date and px.status='Posted'
   group by coalesce(nullif(trim(px.collection_item),''),'Unspecified')) x),'{}'::jsonb),
 coalesce(jsonb_agg(jsonb_build_object(
  'payment_id',p.id,'receipt_no',p.receipt_no,'admission_number',s.admission_number,
  'learner_name',trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name)),
  'class_name',coalesce(sc.name,'Unassigned')||case when sc.stream is not null and sc.stream<>'' then ' · '||sc.stream else '' end,
  'collection_item',coalesce(nullif(trim(p.collection_item),''),'Unspecified'),'amount_ugx',p.amount_ugx,
  'payment_method',p.payment_method,'payment_reference',p.payment_reference,'status',p.status,
  'received_at',p.received_at,'receiver_name',coalesce(up.full_name,'School bursar')
 ) order by p.received_at,p.receipt_no),'[]'::jsonb),
 now(),v_uid,now()
 from public.school_payments p join public.students s on s.id=p.student_id
 left join public.school_classes sc on sc.id=s.class_id left join public.user_profiles up on up.id=p.received_by
 where timezone('Africa/Kampala',p.received_at)::date=p_date
 on conflict(collection_date) do update set record_no=excluded.record_no,posted_receipt_count=excluded.posted_receipt_count,total_received_ugx=excluded.total_received_ugx,reversed_receipt_count=excluded.reversed_receipt_count,reversed_total_ugx=excluded.reversed_total_ugx,totals_by_item=excluded.totals_by_item,entries=excluded.entries,generated_at=excluded.generated_at,generated_by=excluded.generated_by,updated_at=excluded.updated_at;
end;
$$;
revoke all on function public.refresh_daily_collection_record(date) from public,anon;
grant execute on function public.refresh_daily_collection_record(date) to authenticated;

create or replace function public.refresh_daily_collection_record_after_payment()
returns trigger language plpgsql set search_path=''
as $$
begin
 perform public.refresh_daily_collection_record(timezone('Africa/Kampala',new.received_at)::date);
 if tg_op='UPDATE' and timezone('Africa/Kampala',old.received_at)::date<>timezone('Africa/Kampala',new.received_at)::date then perform public.refresh_daily_collection_record(timezone('Africa/Kampala',old.received_at)::date); end if;
 return new;
end;
$$;
drop trigger if exists trg_refresh_daily_collection_record on public.school_payments;
create trigger trg_refresh_daily_collection_record after insert or update of status,received_at,amount_ugx,collection_item on public.school_payments for each row execute function public.refresh_daily_collection_record_after_payment();
