-- ATHAVE V16: Run this ONCE in the Supabase SQL editor BEFORE deploying V16.
-- Private, guest-session based human-edited product-photo orders. No client-side DB keys.
create extension if not exists pgcrypto;

create table if not exists public.manual_customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'Customer',
  contact text not null default '',
  recovery_hash text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.manual_memberships (
  customer_id uuid primary key references public.manual_customers(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  upload_cap integer not null default 50 check (upload_cap >= 50),
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.manual_customers(id) on delete cascade,
  kind text not null check (kind in ('month','addon')),
  amount_paise integer not null check (amount_paise in (49900,9900)),
  gateway_order_id text not null unique,
  gateway_payment_id text,
  status text not null default 'pending' check (status in ('pending','paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists manual_payments_customer_idx on public.manual_payments(customer_id,created_at desc);
create table if not exists public.manual_uploads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.manual_customers(id) on delete cascade,
  batch_id uuid not null,
  filename text not null,
  mime_type text not null,
  source_path text not null default '',
  status text not null default 'uploading' check (status in ('uploading','processing','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists manual_uploads_customer_idx on public.manual_uploads(customer_id,created_at desc);
create index if not exists manual_uploads_batch_idx on public.manual_uploads(batch_id);
create table if not exists public.manual_outputs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.manual_uploads(id) on delete cascade,
  object_path text not null unique,
  filename text not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists manual_outputs_upload_idx on public.manual_outputs(upload_id,created_at desc);
create table if not exists public.manual_ai_usage (
  customer_id uuid not null references public.manual_customers(id) on delete cascade,
  used_on date not null default (now() at time zone 'UTC')::date,
  chat_calls integer not null default 0,
  image_calls integer not null default 0,
  primary key(customer_id,used_on)
);

-- Use the backend service role exclusively. Do not create anon/authenticated read policies.
alter table public.manual_customers enable row level security;
alter table public.manual_memberships enable row level security;
alter table public.manual_payments enable row level security;
alter table public.manual_uploads enable row level security;
alter table public.manual_outputs enable row level security;
alter table public.manual_ai_usage enable row level security;
revoke all on public.manual_customers, public.manual_memberships, public.manual_payments, public.manual_uploads, public.manual_outputs, public.manual_ai_usage from anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('athave-manual','athave-manual',false,12582912,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=12582912,allowed_mime_types=excluded.allowed_mime_types;

-- Atomic quota check and reservation. Every original image is ONE upload.
create or replace function public.manual_reserve_upload(p_customer uuid,p_batch uuid,p_filename text,p_mime text)
returns uuid language plpgsql security definer set search_path=public as $$
declare m public.manual_memberships%rowtype; u uuid;
begin
  select * into m from public.manual_memberships where customer_id=p_customer for update;
  if not found or now()>=m.period_end then raise exception 'Your monthly plan has expired. Renew for ₹499.'; end if;
  if m.used>=m.upload_cap then raise exception 'You have used your uploads. Add 50 more for ₹99.'; end if;
  if length(p_filename)>160 or length(p_filename)<1 then raise exception 'Invalid filename'; end if;
  if p_mime not in ('image/jpeg','image/png','image/webp') then raise exception 'Unsupported image type'; end if;
  insert into public.manual_uploads(customer_id,batch_id,filename,mime_type)
  values(p_customer,p_batch,p_filename,p_mime) returning id into u;
  update public.manual_memberships set used=used+1,updated_at=now() where customer_id=p_customer;
  return u;
end $$;

create or replace function public.manual_confirm_upload(p_customer uuid,p_upload uuid,p_path text)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.manual_uploads set source_path=p_path,status='processing',updated_at=now()
  where id=p_upload and customer_id=p_customer and status='uploading';
  if not found then raise exception 'Upload was not reserved'; end if;
end $$;

create or replace function public.manual_cancel_upload(p_customer uuid,p_upload uuid)
returns void language plpgsql security definer set search_path=public as $$
declare deleted_count int;
begin
  delete from public.manual_uploads where id=p_upload and customer_id=p_customer and status='uploading';
  get diagnostics deleted_count=row_count;
  if deleted_count>0 then
    update public.manual_memberships set used=greatest(0,used-1) where customer_id=p_customer;
  end if;
end $$;

create or replace function public.manual_apply_paid_order(p_order text,p_gateway_payment text)
returns void language plpgsql security definer set search_path=public as $$
declare pay public.manual_payments%rowtype; m public.manual_memberships%rowtype;
begin
  select * into pay from public.manual_payments where gateway_order_id=p_order for update;
  if not found then raise exception 'Unknown manual payment'; end if;
  if pay.status='paid' then return; end if;
  if pay.kind='month' then
    insert into public.manual_memberships(customer_id,period_start,period_end,upload_cap,used)
    values(pay.customer_id,now(),now()+interval '30 days',50,0)
    on conflict (customer_id) do update set period_start=excluded.period_start,
      period_end=excluded.period_end,upload_cap=50,used=0,updated_at=now();
  else
    select * into m from public.manual_memberships where customer_id=pay.customer_id for update;
    if not found or now()>=m.period_end then raise exception 'Add-on cannot be applied after the plan expires. Contact support.'; end if;
    update public.manual_memberships set upload_cap=upload_cap+50,updated_at=now() where customer_id=pay.customer_id;
  end if;
  update public.manual_payments set status='paid',gateway_payment_id=p_gateway_payment,paid_at=now() where id=pay.id;
end $$;

create or replace function public.manual_reserve_ai(p_customer uuid,p_image boolean,p_chat_max int,p_image_max int)
returns void language plpgsql security definer set search_path=public as $$
declare m public.manual_memberships%rowtype; current_row public.manual_ai_usage%rowtype;
begin
  select * into m from public.manual_memberships where customer_id=p_customer;
  if not found or now()>=m.period_end then raise exception 'A current ₹499 monthly plan is required for the AI studio'; end if;
  insert into public.manual_ai_usage(customer_id,used_on) values(p_customer,(now() at time zone 'UTC')::date)
  on conflict do nothing;
  select * into current_row from public.manual_ai_usage where customer_id=p_customer and used_on=(now() at time zone 'UTC')::date for update;
  if p_image then
    if current_row.image_calls >= p_image_max then raise exception 'AI image requests are temporarily unavailable today'; end if;
    update public.manual_ai_usage set image_calls=image_calls+1 where customer_id=p_customer and used_on=current_row.used_on;
  else
    if current_row.chat_calls >= p_chat_max then raise exception 'AI chat requests are temporarily unavailable today'; end if;
    update public.manual_ai_usage set chat_calls=chat_calls+1 where customer_id=p_customer and used_on=current_row.used_on;
  end if;
end $$;

-- Revoke function execution from public API roles; only service_role backend may invoke.
revoke all on function public.manual_reserve_upload(uuid,uuid,text,text),public.manual_confirm_upload(uuid,uuid,text),public.manual_cancel_upload(uuid,uuid),public.manual_apply_paid_order(text,text),public.manual_reserve_ai(uuid,boolean,int,int) from public,anon,authenticated;
grant execute on function public.manual_reserve_upload(uuid,uuid,text,text),public.manual_confirm_upload(uuid,uuid,text),public.manual_cancel_upload(uuid,uuid),public.manual_apply_paid_order(text,text),public.manual_reserve_ai(uuid,boolean,int,int) to service_role;

create table if not exists public.manual_ai_images (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.manual_customers(id) on delete cascade,
 object_path text not null unique,
 mime_type text not null,
 prompt text not null default '',
 created_at timestamptz not null default now()
);
alter table public.manual_ai_images enable row level security;
revoke all on public.manual_ai_images from anon,authenticated;

-- Release quota held by uploads that never finished because the browser/network stopped.
create or replace function public.manual_refund_stale_uploads(p_customer uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  -- Lock the membership before adjusting its upload count (same lock order as reservation).
  perform 1 from public.manual_memberships where customer_id=p_customer for update;
  with removed as (
    delete from public.manual_uploads where customer_id=p_customer and status='uploading'
      and created_at<now()-interval '20 minutes' returning id
  ) select count(*) into n from removed;
  if n>0 then
    update public.manual_memberships set used=greatest(used-n,0),updated_at=now() where customer_id=p_customer;
  end if;
  return n;
end $$;
revoke all on function public.manual_refund_stale_uploads(uuid) from public,anon,authenticated;
grant execute on function public.manual_refund_stale_uploads(uuid) to service_role;
