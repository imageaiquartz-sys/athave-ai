-- V17 upgrade. RUN AFTER setup.sql, OTP patches, AND v16_manual_upload_service.sql.
-- Does not delete or reset V16 customers, photos, or payment records.
begin;
create extension if not exists pgcrypto;

alter table public.manual_customers add column if not exists account_customer_id uuid;
-- V16 required a recovery hash on every row. OTP accounts don't use one.
alter table public.manual_customers alter column recovery_hash drop not null;
-- Verify that the original OTP `customers` table exists (provided by setup.sql).
-- Preserve existing guests; linking occurs once the owner proves phone ownership by OTP.
do $$ begin
 if not exists(select 1 from pg_constraint where conname='manual_customers_account_fk') then
   alter table public.manual_customers add constraint manual_customers_account_fk
   foreign key(account_customer_id) references public.customers(id) on delete set null;
 end if;
end $$;
create unique index if not exists manual_customers_account_unique
 on public.manual_customers(account_customer_id) where account_customer_id is not null;

create table if not exists public.manual_site_settings (
 id text primary key,
 mode text not null check(mode in ('default','transparent','background')),
 object_path text,
 mime_type text,
 updated_at timestamptz not null default now()
);
alter table public.manual_site_settings enable row level security;

-- Fix 42501 'permission denied for table manual_customers' from V16.
-- Service-role is used only by server-side Cloudflare Pages Functions.
grant usage on schema public to service_role;
grant select,insert,update,delete on table
 public.manual_customers,public.manual_memberships,public.manual_payments,
 public.manual_uploads,public.manual_outputs,public.manual_ai_usage,
 public.manual_ai_images,public.manual_site_settings to service_role;
grant usage,select on all sequences in schema public to service_role;

-- No direct anon/authenticated access. All private reads and writes checked server-side.
revoke all on public.manual_site_settings from anon,authenticated;
revoke all on public.manual_customers,public.manual_memberships,public.manual_payments,
 public.manual_uploads,public.manual_outputs,public.manual_ai_usage,
 public.manual_ai_images from anon,authenticated;

-- Avoid publicly callable privileged functions.
revoke all on function public.manual_refund_stale_uploads(uuid) from public,anon,authenticated;
grant execute on function public.manual_refund_stale_uploads(uuid) to service_role;
commit;
