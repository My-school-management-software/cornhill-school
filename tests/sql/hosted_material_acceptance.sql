\set ON_ERROR_STOP on
set role authenticated;
select set_config('test.actor','00000000-0000-4000-8000-000000000001',false);
insert into public.school_material_catalogue(class_id,term_id,label,category,unit,quantity,duration,starts_on,ends_on)
values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Synthetic pencils','scholastic','piece',6,'termly','2026-09-01','2026-12-01');
do $$
declare c uuid; a uuid; b uuid;
begin
 select id into strict c from public.school_material_catalogue;
 a:=public.record_nursery_office_delivery('40000000-0000-4000-8000-000000000001',c,'30000000-0000-4000-8000-000000000001',2);
 b:=public.record_nursery_office_delivery('40000000-0000-4000-8000-000000000001',c,'30000000-0000-4000-8000-000000000001',2);
 if a<>b or (select count(*) from public.school_nursery_office_deliveries)<>1 then raise exception 'Idempotency failed'; end if;
 if exists(select 1 from public.school_nursery_office_deliveries where student_id='30000000-0000-4000-8000-000000000002') then raise exception 'Other learner changed'; end if;
 begin
  perform public.record_nursery_office_delivery('40000000-0000-4000-8000-000000000001',c,'30000000-0000-4000-8000-000000000001',3);
  raise exception 'TEST_FAILURE: mismatched retry accepted';
 exception when raise_exception then if sqlerrm like 'TEST_FAILURE:%' then raise; end if; end;
 begin
  perform public.record_nursery_office_delivery('40000000-0000-4000-8000-000000000002',c,'30000000-0000-4000-8000-000000000003',1);
  raise exception 'TEST_FAILURE: wrong class accepted';
 exception when raise_exception then if sqlerrm like 'TEST_FAILURE:%' then raise; end if; end;
 begin
  perform public.record_nursery_office_delivery('40000000-0000-4000-8000-000000000003',c,'30000000-0000-4000-8000-000000000001',5);
  raise exception 'TEST_FAILURE: excessive quantity accepted';
 exception when raise_exception then if sqlerrm like 'TEST_FAILURE:%' then raise; end if; end;
 perform public.record_nursery_office_delivery('40000000-0000-4000-8000-000000000004',c,'30000000-0000-4000-8000-000000000001',4);
 if (select sum(quantity) from public.school_nursery_office_deliveries)<>6 then raise exception 'Partial completion failed'; end if;
 begin
  delete from public.school_nursery_office_deliveries; raise exception 'TEST_FAILURE: delete allowed';
 exception when insufficient_privilege then null; end;
 begin
  update public.school_nursery_office_deliveries set quantity=1; raise exception 'TEST_FAILURE: update allowed';
 exception when insufficient_privilege then null; end;
 perform set_config('test.catalogue',c::text,false);
end $$;
select set_config('test.actor','00000000-0000-4000-8000-000000000002',false);
do $$
begin
 if exists(select 1 from public.school_nursery_office_deliveries) then raise exception 'Teacher data leak'; end if;
 begin
  perform public.record_nursery_office_delivery('40000000-0000-4000-8000-000000000005',current_setting('test.catalogue')::uuid,'30000000-0000-4000-8000-000000000002',1);
  raise exception 'TEST_FAILURE: unauthorized receipt';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('test.actor','00000000-0000-4000-8000-000000000003',false);
do $$ begin
 if exists(select 1 from public.school_nursery_office_deliveries) then raise exception 'Inactive staff data leak'; end if;
end $$;
reset role;
set role anon;
do $$ begin
 begin
  perform count(*) from public.school_nursery_office_deliveries; raise exception 'TEST_FAILURE: anonymous read';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: synthetic Nursery office acceptance';
