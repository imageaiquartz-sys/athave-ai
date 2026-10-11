-- Athave AI OTP security patch v2 — safe to run after the original setup.sql.
-- This records minimal hashed-IP send attempts. No OTP code is stored.
create table if not exists public.otp_send_attempts (
  id bigint generated always as identity primary key,
  phone text not null,
  ip_digest text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.otp_verify_attempts (
  id bigint generated always as identity primary key,
  phone text not null,
  ip_digest text not null,
  created_at timestamptz not null default now()
);
create index if not exists otp_verify_attempts_phone_created
on public.otp_verify_attempts (phone, created_at desc);

alter table public.otp_verify_attempts enable row level security;

create index if not exists otp_send_attempts_phone_created
on public.otp_send_attempts (phone, created_at desc);
create index if not exists otp_send_attempts_ip_created
on public.otp_send_attempts (ip_digest, created_at desc);

alter table public.otp_send_attempts enable row level security;

-- Global lock serializes rate-limiter checks across Cloudflare's many regions.
create or replace function public.reserve_otp_send(p_phone text, p_ip_digest text)
returns boolean language plpgsql security definer set search_path=public as $$
declare now_utc timestamptz := now();
begin
 if p_phone !~ '^91[6-9][0-9]{9}$'
    or length(coalesce(p_ip_digest,'')) not between 16 and 120 then
    raise exception 'Invalid OTP request';
 end if;
 perform pg_advisory_xact_lock(572901233);

 if (select count(*) from public.otp_send_attempts
     where phone=p_phone and created_at > now_utc-interval '10 minutes') >= 2 then
   raise exception 'Please wait before requesting more OTPs for this number';
 end if;
 if (select count(*) from public.otp_send_attempts
     where phone=p_phone and created_at > now_utc-interval '24 hours') >= 6 then
   raise exception 'Daily OTP limit reached for this number';
 end if;
 if (select count(*) from public.otp_send_attempts
     where ip_digest=p_ip_digest and created_at > now_utc-interval '1 hour') >= 10 then
   raise exception 'Too many OTP requests from this network';
 end if;
 if (select count(*) from public.otp_send_attempts
     where created_at > now_utc-interval '1 hour') >= 150 then
   raise exception 'OTP system is busy; try again later';
 end if;

 insert into public.otp_send_attempts(phone,ip_digest) values(p_phone,p_ip_digest);
 delete from public.otp_send_attempts where created_at < now_utc - interval '2 days';
 return true;
end; $$;

create or replace function public.reserve_otp_verify(p_phone text, p_ip_digest text)
returns boolean language plpgsql security definer set search_path=public as $$
declare now_utc timestamptz := now();
begin
 if p_phone !~ '^91[6-9][0-9]{9}$'
    or length(coalesce(p_ip_digest,'')) not between 16 and 120 then
    raise exception 'Invalid OTP verification';
 end if;
 perform pg_advisory_xact_lock(572901234);
 if (select count(*) from public.otp_verify_attempts
     where phone=p_phone and created_at > now_utc-interval '10 minutes') >= 6 then
    raise exception 'Too many incorrect codes. Please request a new OTP later';
 end if;
 if (select count(*) from public.otp_verify_attempts
     where ip_digest=p_ip_digest and created_at > now_utc-interval '10 minutes') >= 15 then
    raise exception 'Too many OTP attempts from this network';
 end if;
 insert into public.otp_verify_attempts(phone,ip_digest) values(p_phone,p_ip_digest);
 delete from public.otp_verify_attempts where created_at < now_utc-interval '2 days';
 return true;
end; $$;

revoke all on table public.otp_verify_attempts from public, anon, authenticated;
revoke all on function public.reserve_otp_verify(text,text) from public, anon, authenticated;
grant execute on function public.reserve_otp_verify(text,text) to service_role;
revoke all on table public.otp_send_attempts from public, anon, authenticated;
revoke all on function public.reserve_otp_send(text,text) from public, anon, authenticated;
grant execute on function public.reserve_otp_send(text,text) to service_role;
