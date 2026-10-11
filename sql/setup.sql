-- Athave AI: run once in Supabase SQL Editor (new empty project).
-- Public RLS policies deliberately absent: ONLY server-side service-role can access data.
create extension if not exists pgcrypto;

create table if not exists public.customers (
 id uuid primary key default gen_random_uuid(),
 phone text not null unique check(phone ~ '^91[6-9][0-9]{9}$'),
 name text not null check(length(trim(name)) between 1 and 80),
 is_admin boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.wallets (
 customer_id uuid primary key references public.customers(id) on delete cascade,
 balance integer not null default 0 check(balance>=0),
 purchased integer not null default 0 check(purchased>=0),
 used integer not null default 0 check(used>=0),
 updated_at timestamptz not null default now()
);
create table if not exists public.otp_claims (
 token_digest text primary key, claimed_at timestamptz not null default now()
);
create table if not exists public.pending_signups (
 claim_digest text primary key, phone text not null,
 expires_at timestamptz not null default (now()+interval '10 minutes')
);
create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 plan text not null check(plan in ('starter','topup','custom')),
 amount_paise integer not null check(amount_paise between 10000 and 1000000),
 credits integer not null check(credits>0),
 gateway_order_id text unique not null,
 gateway_payment_id text unique,
 status text not null default 'pending' check(status in ('pending','paid')),
 created_at timestamptz not null default now(),
 paid_at timestamptz
);
create table if not exists public.jobs (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id),
 kind text not null, side text not null,
 status text not null default 'processing' check(status in ('processing','completed','failed')),
 storage_path text,
 failure text,
 created_at timestamptz not null default now(),
 finished_at timestamptz
);
create index if not exists jobs_user_created on public.jobs(customer_id, created_at desc);
create index if not exists payments_user_created on public.payments(customer_id, created_at desc);

alter table public.customers enable row level security;
alter table public.wallets enable row level security;
alter table public.otp_claims enable row level security;
alter table public.pending_signups enable row level security;
alter table public.payments enable row level security;
alter table public.jobs enable row level security;

-- Verified OTP transaction. Token is redeemed once. A fresh account needs name before login.
create or replace function public.prepare_phone_login(p_phone text, p_token_digest text, p_claim_digest text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if p_phone !~ '^91[6-9][0-9]{9}$' then raise exception 'Invalid verified phone'; end if;
 insert into public.otp_claims(token_digest) values(p_token_digest); -- unique constraint blocks replay
 select id into v_id from public.customers where phone=p_phone;
 if v_id is not null then
   return jsonb_build_object('needs_name',false,'customer_id',v_id);
 end if;
 insert into public.pending_signups(claim_digest,phone) values(p_claim_digest,p_phone);
 return jsonb_build_object('needs_name',true);
end; $$;

create or replace function public.complete_phone_signup(p_claim_digest text,p_name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_phone text; v_id uuid;
begin
 if length(trim(coalesce(p_name,''))) not between 1 and 80 then raise exception 'Valid name required'; end if;
 delete from public.pending_signups
 where claim_digest=p_claim_digest and expires_at>now() returning phone into v_phone;
 if v_phone is null then raise exception 'Sign-up challenge expired'; end if;
 insert into public.customers(phone,name) values(v_phone,trim(p_name))
 on conflict(phone) do update set phone=excluded.phone
 returning id into v_id;
 insert into public.wallets(customer_id) values(v_id) on conflict do nothing;
 return v_id;
end; $$;

-- Idempotent receipt of verified CAPTURED Razorpay payments.
create or replace function public.credit_paid_order(p_order text,p_payment text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_payment public.payments%rowtype;
begin
 select * into v_payment from public.payments where gateway_order_id=p_order for update;
 if not found then raise exception 'Unknown order'; end if;
 if v_payment.status='paid' then
   if v_payment.gateway_payment_id <> p_payment then raise exception 'Conflicting gateway payment'; end if;
   return false;
 end if;
 update public.payments set status='paid',gateway_payment_id=p_payment,paid_at=now() where id=v_payment.id;
 insert into public.wallets(customer_id) values(v_payment.customer_id) on conflict do nothing;
 update public.wallets set balance=balance+v_payment.credits,purchased=purchased+v_payment.credits,updated_at=now()
 where customer_id=v_payment.customer_id;
 return true;
end; $$;

-- Global transaction lock serializes budget quota and credit reservations.
create or replace function public.reserve_generation(p_customer uuid,p_kind text,p_side text,p_monthly_max int,p_daily_max int)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_balance int; v_job uuid;
begin
 perform pg_advisory_xact_lock(42627641);
 if (select count(*) from public.jobs where created_at >= date_trunc('month',now())) >= p_monthly_max then
   raise exception 'AI site-wide monthly safety limit reached';
 end if;
 if (select count(*) from public.jobs where customer_id=p_customer and created_at > now()-interval '24 hours') >= p_daily_max then
   raise exception 'Daily image limit reached';
 end if;
 select balance into v_balance from public.wallets where customer_id=p_customer for update;
 if coalesce(v_balance,0) < 1 then raise exception 'Not enough image limit; top up first'; end if;
 update public.wallets set balance=balance-1,updated_at=now() where customer_id=p_customer;
 insert into public.jobs(customer_id,kind,side) values(p_customer,left(p_kind,30),left(p_side,20)) returning id into v_job;
 return v_job;
end; $$;

create or replace function public.finish_generation(p_job uuid,p_storage_path text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_customer uuid;
begin
 select customer_id into v_customer from public.jobs where id=p_job and status='processing' for update;
 if v_customer is null then return false; end if;
 update public.jobs set status='completed',storage_path=p_storage_path,finished_at=now() where id=p_job;
 update public.wallets set used=used+1,updated_at=now() where customer_id=v_customer;
 return true;
end; $$;

create or replace function public.fail_generation(p_job uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_customer uuid;
begin
 select customer_id into v_customer from public.jobs where id=p_job and status='processing' for update;
 if v_customer is null then return false; end if;
 update public.jobs set status='failed',failure=left(p_reason,180),finished_at=now() where id=p_job;
 update public.wallets set balance=balance+1,updated_at=now() where customer_id=v_customer;
 return true;
end; $$;

create or replace function public.refund_stale_generations(p_customer uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare r record; v_count integer:=0;
begin
 for r in select id from public.jobs
   where customer_id=p_customer and status='processing' and created_at < now()-interval '20 minutes'
   for update skip locked
 loop
   if public.fail_generation(r.id,'Timed out; image credit restored') then v_count:=v_count+1; end if;
 end loop;
 return v_count;
end; $$;

-- Only backend service-role may call any of these privileged functions.
revoke all on function public.prepare_phone_login(text,text,text) from public,anon,authenticated;
revoke all on function public.complete_phone_signup(text,text) from public,anon,authenticated;
revoke all on function public.credit_paid_order(text,text) from public,anon,authenticated;
revoke all on function public.reserve_generation(uuid,text,text,int,int) from public,anon,authenticated;
revoke all on function public.finish_generation(uuid,text) from public,anon,authenticated;
revoke all on function public.fail_generation(uuid,text) from public,anon,authenticated;
revoke all on function public.refund_stale_generations(uuid) from public,anon,authenticated;
grant execute on function public.prepare_phone_login(text,text,text) to service_role;
grant execute on function public.complete_phone_signup(text,text) to service_role;
grant execute on function public.credit_paid_order(text,text) to service_role;
grant execute on function public.reserve_generation(uuid,text,text,int,int) to service_role;
grant execute on function public.finish_generation(uuid,text) to service_role;
grant execute on function public.fail_generation(uuid,text) to service_role;
grant execute on function public.refund_stale_generations(uuid) to service_role;

-- After first verified signup, optionally authorize your own number as admin:
-- update public.customers set is_admin=true where phone='91YOUR10DIGITNUMBER';

-- Create private storage bucket for outputs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('athave-results','athave-results',false,8500000,array['image/png','image/jpeg','image/webp']::text[])
on conflict (id) do nothing;
