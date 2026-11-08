-- Admin-only Records Centre search. Uses the existing GIN OCR text index.
create or replace function public.search_school_records(
  p_query text default null,
  p_type text default null,
  p_status text default null,
  p_expiry_filter text default null,
  p_limit integer default 500
)
returns setof public.school_record_index
language plpgsql security definer set search_path=''
as $function$
declare v_query text:=nullif(btrim(coalesce(p_query,'')),'');
begin
  if auth.uid() is null or not coalesce(public.is_school_admin(),false) then
    raise exception 'Only administrators can search school records' using errcode='42501';
  end if;
  if p_expiry_filter is not null and p_expiry_filter not in ('expired','7','30','valid','none') then
    raise exception 'Invalid expiry filter';
  end if;
  return query
  select r.*
  from public.school_record_index r
  where (nullif(btrim(coalesce(p_type,'')),'') is null or r.record_type=p_type)
    and (nullif(btrim(coalesce(p_status,'')),'') is null or r.verification_status=p_status)
    and (
      v_query is null
      or r.record_title ilike '%'||v_query||'%'
      or r.record_type ilike '%'||v_query||'%'
      or coalesce(r.original_file_name,'') ilike '%'||v_query||'%'
      or coalesce(r.record_identifier,'') ilike '%'||v_query||'%'
      or coalesce(r.issuing_authority,'') ilike '%'||v_query||'%'
      or coalesce(r.source_context_type,'') ilike '%'||v_query||'%'
      or coalesce(r.source_record_id,'') ilike '%'||v_query||'%'
      or to_tsvector('simple',coalesce(r.extracted_text,'')) @@ plainto_tsquery('simple',v_query)
    )
    and (
      p_expiry_filter is null
      or (p_expiry_filter='none' and r.expires_on is null)
      or (p_expiry_filter='expired' and r.expires_on<current_date)
      or (p_expiry_filter='7' and r.expires_on between current_date and current_date+7)
      or (p_expiry_filter='30' and r.expires_on between current_date and current_date+30)
      or (p_expiry_filter='valid' and r.expires_on>current_date+30)
    )
  order by r.updated_at desc
  limit least(greatest(coalesce(p_limit,500),1),1000);
end;
$function$;
revoke all on function public.search_school_records(text,text,text,text,integer) from public,anon;
grant execute on function public.search_school_records(text,text,text,text,integer) to authenticated;
