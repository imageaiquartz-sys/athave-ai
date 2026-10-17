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
