-- CORNHILL inventory foundation. Apply only to a staging database first.
create table if not exists public.inventory_categories (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 description text,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.inventory_items (
 id uuid primary key default gen_random_uuid(),
 category_id uuid references public.inventory_categories(id) on delete set null,
 item_code text unique,
 name text not null,
 unit text not null default 'piece',
 reorder_level numeric(12,2) not null default 0 check (reorder_level >= 0),
 notes text,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.inventory_movements (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.inventory_items(id) on delete restrict,
 movement_type text not null check (movement_type in ('RECEIVE','ISSUE','ADJUST')),
 quantity numeric(12,2) not null check (quantity > 0),
 reference text,
 notes text,
 occurred_at timestamptz not null default now(),
 created_by uuid not null default auth.uid() references auth.users(id)
);
create index if not exists inventory_movements_item_date_idx on public.inventory_movements(item_id, occurred_at desc);
create index if not exists inventory_items_category_idx on public.inventory_items(category_id);
create or replace function public.inventory_prevent_negative_stock()
returns trigger language plpgsql set search_path = '' as $$
declare current_qty numeric(12,2);
begin
 perform 1 from public.inventory_items where id=new.item_id for update;
 select coalesce(sum(case movement_type when 'RECEIVE' then quantity when 'ISSUE' then -quantity when 'ADJUST' then quantity end),0)
 into current_qty from public.inventory_movements where item_id=new.item_id;
 if new.movement_type='ISSUE' and new.quantity>current_qty then
  raise exception 'Insufficient stock. Available quantity: %', current_qty;
 end if;
 return new;
end $$;
drop trigger if exists inventory_prevent_negative_stock on public.inventory_movements;
create trigger inventory_prevent_negative_stock before insert on public.inventory_movements
for each row execute function public.inventory_prevent_negative_stock();
create or replace function public.inventory_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists inventory_items_touch_updated_at on public.inventory_items;
create trigger inventory_items_touch_updated_at before update on public.inventory_items
for each row execute function public.inventory_touch_updated_at();
create or replace view public.inventory_stock_summary
with (security_invoker = true) as
select i.id, i.item_code, i.name, i.unit, i.reorder_level, i.is_active,
       c.name as category_name,
       coalesce(sum(case m.movement_type when 'RECEIVE' then m.quantity when 'ISSUE' then -m.quantity when 'ADJUST' then m.quantity end),0)::numeric(12,2) as quantity_on_hand
from public.inventory_items i
left join public.inventory_categories c on c.id=i.category_id
left join public.inventory_movements m on m.item_id=i.id
group by i.id, i.item_code, i.name, i.unit, i.reorder_level, i.is_active, c.name;
alter table public.inventory_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
drop policy if exists "Inventory admin categories" on public.inventory_categories;
create policy "Inventory admin categories" on public.inventory_categories
for all to authenticated using ((select public.is_school_admin())) with check ((select public.is_school_admin()));
drop policy if exists "Inventory admin items" on public.inventory_items;
create policy "Inventory admin items" on public.inventory_items
for all to authenticated using ((select public.is_school_admin())) with check ((select public.is_school_admin()));
drop policy if exists "Inventory admin movements" on public.inventory_movements;
create policy "Inventory admin movements" on public.inventory_movements
for all to authenticated using ((select public.is_school_admin())) with check ((select public.is_school_admin()));
revoke all on public.inventory_categories, public.inventory_items, public.inventory_movements from public, anon, authenticated;
grant select, insert, update on public.inventory_categories, public.inventory_items to authenticated;
grant select, insert on public.inventory_movements to authenticated;
revoke update, delete, truncate on public.inventory_movements from authenticated;
revoke all on public.inventory_stock_summary from public, anon, authenticated;
grant select on public.inventory_stock_summary to authenticated;
