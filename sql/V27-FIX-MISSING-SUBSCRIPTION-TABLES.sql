-- ATHAVE V27.1 — ONE-STEP SUPABASE REPAIR + UNLIMITED PRO
-- Run this WHOLE file in the SQL editor of the correct Athave AI Supabase project.
-- Repairs missing V24 Razorpay subscription tables before installing V27 functions.
-- It does NOT delete customers, images, orders, stored payment records or subscriptions.
-- Re-runnable: V24 uses IF NOT EXISTS; subscription charges retain a unique payment ID.
-- Requires baseline V16 customer/membership/upload/AI tables.
-- Do not manually insert payment/charge records. Pro activates only after verified
-- Razorpay payment handling from the backend.

begin;

-- Give a direct precondition error if the baseline schema isn't installed.
do $v27_base$
begin
 if to_regclass('public.manual_customers') is null
    or to_regclass('public.manual_memberships') is null
    or to_regclass('public.manual_uploads') is null
    or to_regclass('public.manual_ai_usage') is null then
  raise exception 'Athave baseline tables are missing. Install sql/v16_manual_upload_service.sql before V27.';
 end if;
end
$v27_base$;

-- 1) Backfill the missing V24 Razorpay tables, constraints and RPC dependencies.
-- ATHAVE V24: recurring ₹699 per calendar month, 50 uploads/cycle. Run once before deploying.
-- Existing paid memberships and uploaded files are retained. New one-time top-ups are disabled in the API.
create table if not exists public.manual_subscriptions (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.manual_customers(id) on delete cascade,
 gateway_subscription_id text not null unique,
 plan_id text not null,
 status text not null default 'created' check (status in ('created','authenticated','active','pending','halted','cancelled','completed','expired','paused')),
 cancel_at_cycle_end boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists manual_subscriptions_customer_idx on public.manual_subscriptions(customer_id, created_at desc);
create unique index if not exists manual_one_open_subscription_per_customer on public.manual_subscriptions(customer_id)
 where status in ('created','authenticated','active','pending','halted','paused');

create table if not exists public.manual_subscription_charges (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.manual_customers(id) on delete cascade,
 gateway_subscription_id text not null references public.manual_subscriptions(gateway_subscription_id),
 gateway_payment_id text not null unique,
 amount_paise integer not null default 69900 check (amount_paise=69900),
 period_start timestamptz not null,
 period_end timestamptz not null,
 created_at timestamptz not null default now(),
 constraint valid_subscription_cycle check (period_end>period_start)
);
create index if not exists manual_subscription_charges_customer_idx on public.manual_subscription_charges(customer_id,created_at desc);
alter table public.manual_subscriptions enable row level security;
alter table public.manual_subscription_charges enable row level security;
revoke all on public.manual_subscriptions,public.manual_subscription_charges from public,anon,authenticated;
grant all on public.manual_subscriptions,public.manual_subscription_charges to service_role;

-- Verified Razorpay webhook and signed checkout path call this with the correct cycle.
-- The row locks and gateway_payment_id uniqueness prevent double credits from repeated webhooks.
create or replace function public.manual_apply_subscription_charge(
 p_subscription text,p_gateway_payment text,p_period_start bigint,p_period_end bigint
) returns boolean language plpgsql security definer set search_path=public as $$
declare s public.manual_subscriptions%rowtype;
        membership public.manual_memberships%rowtype;
        inserted_id uuid;
        start_ts timestamptz; end_ts timestamptz;
begin
 select * into s from public.manual_subscriptions where gateway_subscription_id=p_subscription for update;
 if not found then raise exception 'Unknown subscription; retry webhook'; end if;
 if p_gateway_payment !~ '^pay_[A-Za-z0-9]{6,60}$' then raise exception 'Invalid charge identifier'; end if;
 if p_period_end <= p_period_start or p_period_end-p_period_start not between 25*86400 and 35*86400 then
   raise exception 'Invalid billing cycle';
 end if;
 start_ts := to_timestamp(p_period_start); end_ts:=to_timestamp(p_period_end);
 insert into public.manual_subscription_charges(customer_id,gateway_subscription_id,gateway_payment_id,period_start,period_end)
 values(s.customer_id,p_subscription,p_gateway_payment,start_ts,end_ts)
 on conflict (gateway_payment_id) do nothing returning id into inserted_id;
 if inserted_id is null then return false; end if;
 select * into membership from public.manual_memberships where customer_id=s.customer_id for update;
 if not found or end_ts>membership.period_end then
   insert into public.manual_memberships(customer_id,period_start,period_end,upload_cap,used)
   values(s.customer_id,start_ts,end_ts,50,0)
   on conflict (customer_id) do update set period_start=excluded.period_start,
       period_end=excluded.period_end,upload_cap=50,used=0,updated_at=now();
 end if;
 update public.manual_subscriptions set status='active',updated_at=now() where id=s.id
   and status not in ('cancelled','completed','expired');
 return true;
end $$;
revoke all on function public.manual_apply_subscription_charge(text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.manual_apply_subscription_charge(text,text,bigint,bigint) to service_role;

-- Update customer-facing quota errors, with unchanged quota/security logic.
create or replace function public.manual_reserve_upload(p_customer uuid,p_batch uuid,p_filename text,p_mime text)
returns uuid language plpgsql security definer set search_path=public as $$
declare m public.manual_memberships%rowtype; u uuid;
begin
  select * into m from public.manual_memberships where customer_id=p_customer for update;
  if not found or now()>=m.period_end then raise exception 'Your monthly plan has expired. Subscribe for ₹699/month.'; end if;
  if m.used>=m.upload_cap then raise exception 'You have used your 50 monthly uploads. Your allowance resets on successful renewal.'; end if;
  if length(p_filename)>160 or length(p_filename)<1 then raise exception 'Invalid filename'; end if;
  if p_mime not in ('image/jpeg','image/png','image/webp') then raise exception 'Unsupported image type'; end if;
  insert into public.manual_uploads(customer_id,batch_id,filename,mime_type)
  values(p_customer,p_batch,p_filename,p_mime) returning id into u;
  update public.manual_memberships set used=used+1,updated_at=now() where customer_id=p_customer;
  return u;
end $$;
revoke all on function public.manual_reserve_upload(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.manual_reserve_upload(uuid,uuid,text,text) to service_role;

-- Consistent subscription messaging for protected AI Studio requests.
create or replace function public.manual_reserve_ai(p_customer uuid,p_image boolean,p_chat_max int,p_image_max int)
returns void language plpgsql security definer set search_path=public as $$
declare m public.manual_memberships%rowtype; current_row public.manual_ai_usage%rowtype;
begin
  select * into m from public.manual_memberships where customer_id=p_customer;
  if not found or now()>=m.period_end then raise exception 'A current ₹699 monthly subscription is required for AI Studio'; end if;
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
revoke all on function public.manual_reserve_ai(uuid,boolean,int,int) from public,anon,authenticated;
grant execute on function public.manual_reserve_ai(uuid,boolean,int,int) to service_role;

-- 2) Apply V27 unlimited 10-per-batch, paid-cycle-only Pro controls.
-- ATHAVE V27 — ₹699/month PRO: unlimited manual photo uploads, 10 per batch.
-- REQUIRED: run AFTER V16, V22, V23 and V24. Safe to re-run (CREATE OR REPLACE).
-- This migration does not erase any uploads, paid receipts, members, or gallery photos.
-- Existing 50-upload memberships now become unlimited ONLY during an actually paid cycle.
-- Complimentary access granted by the admin is unaffected.

-- Keep `upload_cap` for compatibility with historic schema, but stop enforcing it.
-- 2147483647 is a legacy placeholder; upload counting is now informational only.
update public.manual_memberships set upload_cap=2147483647 where upload_cap<>2147483647;

-- A membership row could come from discontinued one-time top-ups; by itself
-- it must NEVER unlock subscription-only Pro. Require a VERIFIED charge cycle.
create or replace function public.manual_has_paid_access(p_customer uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists (
  select 1 from public.manual_memberships m
  join public.manual_subscription_charges c on c.customer_id=m.customer_id
  where m.customer_id=p_customer
    and m.period_end>now()
    and c.period_start<=now() and c.period_end>now()
 );
$$;
revoke all on function public.manual_has_paid_access(uuid) from public,anon,authenticated;
grant execute on function public.manual_has_paid_access(uuid) to service_role;

-- The signed Razorpay subscription.charged webhook (or verified captured checkout)
-- is the ONLY way to record a successful monthly charge.
-- Unique payment ID prevents double grants on duplicated webhooks.
create or replace function public.manual_apply_subscription_charge(
 p_subscription text,p_gateway_payment text,p_period_start bigint,p_period_end bigint
) returns boolean language plpgsql security definer set search_path=public as $$
declare s public.manual_subscriptions%rowtype;
        membership public.manual_memberships%rowtype;
        inserted_id uuid;
        start_ts timestamptz; end_ts timestamptz;
begin
 select * into s from public.manual_subscriptions where gateway_subscription_id=p_subscription for update;
 if not found then raise exception 'Unknown subscription; retry webhook'; end if;
 if p_gateway_payment !~ '^pay_[A-Za-z0-9]{6,60}$' then raise exception 'Invalid charge identifier'; end if;
 if p_period_end<=p_period_start or p_period_end-p_period_start not between 25*86400 and 35*86400 then
   raise exception 'Invalid billing cycle';
 end if;
 start_ts:=to_timestamp(p_period_start);end_ts:=to_timestamp(p_period_end);
 insert into public.manual_subscription_charges(customer_id,gateway_subscription_id,gateway_payment_id,period_start,period_end)
 values(s.customer_id,p_subscription,p_gateway_payment,start_ts,end_ts)
 on conflict (gateway_payment_id) do nothing returning id into inserted_id;
 if inserted_id is null then return false; end if;
 select * into membership from public.manual_memberships where customer_id=s.customer_id for update;
 if not found or end_ts>membership.period_end then
   insert into public.manual_memberships(customer_id,period_start,period_end,upload_cap,used)
   values(s.customer_id,start_ts,end_ts,2147483647,0)
   on conflict (customer_id) do update set period_start=excluded.period_start,
      period_end=excluded.period_end,upload_cap=2147483647,used=0,updated_at=now();
 end if;
 update public.manual_subscriptions set status='active',updated_at=now() where id=s.id
   and status not in ('cancelled','completed','expired');
 return true;
end $$;
revoke all on function public.manual_apply_subscription_charge(text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.manual_apply_subscription_charge(text,text,bigint,bigint) to service_role;

-- Hold a row lock per customer for atomic counting + max 10 photos per batch.
-- No monthly upload cap: the paid period expiration is the only upload allowance gate.
create or replace function public.manual_reserve_upload(p_customer uuid,p_batch uuid,p_filename text,p_mime text)
returns uuid language plpgsql security definer set search_path=public as $$
declare m public.manual_memberships%rowtype; u uuid; batch_count int;
begin
 select * into m from public.manual_memberships where customer_id=p_customer for update;
 if not found or now()>=m.period_end or not public.manual_has_paid_access(p_customer) then
   raise exception 'Your ₹699 monthly Pro membership is inactive. Renew to upload photos.';
 end if;
 select count(*) into batch_count from public.manual_uploads
  where customer_id=p_customer and batch_id=p_batch;
 if batch_count>=10 then raise exception 'Only 10 images per batch. Start another batch to continue.'; end if;
 if length(p_filename)<1 or length(p_filename)>160 then raise exception 'Invalid filename'; end if;
 if p_mime not in ('image/jpeg','image/png','image/webp') then raise exception 'Unsupported image type'; end if;
 insert into public.manual_uploads(customer_id,batch_id,filename,mime_type)
 values(p_customer,p_batch,p_filename,p_mime) returning id into u;
 update public.manual_memberships set used=used+1,updated_at=now() where customer_id=p_customer;
 return u;
end $$;
revoke all on function public.manual_reserve_upload(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.manual_reserve_upload(uuid,uuid,text,text) to service_role;

-- AI Studio likewise requires a confirmed, unexpired paid billing cycle.
-- Daily AI request safety/fair-use limits remain independent of photo upload quotas.
create or replace function public.manual_reserve_ai(p_customer uuid,p_image boolean,p_chat_max int,p_image_max int)
returns void language plpgsql security definer set search_path=public as $$
declare m public.manual_memberships%rowtype; current_row public.manual_ai_usage%rowtype;
begin
 select * into m from public.manual_memberships where customer_id=p_customer;
 if not found or now()>=m.period_end or not public.manual_has_paid_access(p_customer) then
   raise exception 'An active, paid ₹699 monthly Pro subscription is required for AI Studio';
 end if;
 insert into public.manual_ai_usage(customer_id,used_on) values(p_customer,(now() at time zone 'UTC')::date)
 on conflict do nothing;
 select * into current_row from public.manual_ai_usage
   where customer_id=p_customer and used_on=(now() at time zone 'UTC')::date for update;
 if p_image then
  if current_row.image_calls >= p_image_max then raise exception 'AI image requests are temporarily unavailable today'; end if;
  update public.manual_ai_usage set image_calls=image_calls+1 where customer_id=p_customer and used_on=current_row.used_on;
 else
  if current_row.chat_calls >= p_chat_max then raise exception 'AI chat requests are temporarily unavailable today'; end if;
  update public.manual_ai_usage set chat_calls=chat_calls+1 where customer_id=p_customer and used_on=current_row.used_on;
 end if;
end $$;
revoke all on function public.manual_reserve_ai(uuid,boolean,int,int) from public,anon,authenticated;
grant execute on function public.manual_reserve_ai(uuid,boolean,int,int) to service_role;

-- Refresh PostgREST schema after adding a table/RPC.
notify pgrst, 'reload schema';

commit;

-- Verification: both required tables and key Pro functions should return TRUE.
select
 to_regclass('public.manual_subscriptions') is not null as subscriptions_table_ok,
 to_regclass('public.manual_subscription_charges') is not null as charges_table_ok,
 to_regprocedure('public.manual_has_paid_access(uuid)') is not null as pro_check_ok,
 to_regprocedure('public.manual_reserve_upload(uuid,uuid,text,text)') is not null as upload_reservation_ok;
