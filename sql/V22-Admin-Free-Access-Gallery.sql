-- ATHAVE AI V22 ADDITIVE MIGRATION
-- Run this ONE TIME in Supabase SQL Editor before deploying V22.
-- It does not modify existing memberships, payment receipts, or delivered files.
-- The complimentary grant can be revoked without touching a paid plan.

create table if not exists public.manual_access_grants (
 customer_id uuid primary key references public.manual_customers(id) on delete cascade,
 active boolean not null default true,
 granted_at timestamptz not null default now(),
 ended_at timestamptz
);
create index if not exists manual_access_grants_active_idx on public.manual_access_grants(customer_id) where active;

-- Keep a record of free upload reservations until they have finished. This prevents
-- the existing paid-plan stale-upload refund function from touching a free reservation.
create table if not exists public.manual_access_free_reservations (
 upload_id uuid primary key references public.manual_uploads(id) on delete cascade,
 customer_id uuid not null references public.manual_customers(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index if not exists manual_access_free_reservations_customer_idx on public.manual_access_free_reservations(customer_id,created_at desc);

-- Chat / image safety usage for free access (independent of payment counters).
create table if not exists public.manual_access_ai_calls (
 id bigint generated always as identity primary key,
 customer_id uuid not null references public.manual_customers(id) on delete cascade,
 is_image boolean not null,
 created_at timestamptz not null default now()
);
create index if not exists manual_access_ai_calls_customer_time_idx on public.manual_access_ai_calls(customer_id,created_at desc);
create index if not exists manual_access_ai_calls_images_time_idx on public.manual_access_ai_calls(created_at desc) where is_image;

-- Owner-filtered view. The API always selects customer_id from the verified OTP session,
-- never a customer ID provided by the browser. Storage remains private.
create or replace view public.manual_customer_gallery with (security_invoker=true) as
 select o.id,o.filename,o.created_at,u.customer_id,u.filename as upload_filename
 from public.manual_outputs o
 join public.manual_uploads u on u.id=o.upload_id
 where u.status='completed';

-- Free uploads use their own reservation and refund functions, so paid quota is untouched.
create or replace function public.manual_free_reserve_upload(p_customer uuid,p_batch uuid,p_filename text,p_mime text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 perform 1 from public.manual_access_grants where customer_id=p_customer and active for update;
 if not found then raise exception 'Complimentary access has ended'; end if;
 if p_mime not in ('image/png','image/jpeg','image/webp') or length(trim(coalesce(p_filename,'')))<1 then
  raise exception 'Invalid upload metadata';
 end if;
 -- Limit abuse of a free grant without charging any member credits.
 if (select count(*) from public.manual_uploads where customer_id=p_customer and created_at>now()-interval '24 hours')>=60 then
  raise exception 'Daily complimentary upload limit reached (60 photos)';
 end if;
 insert into public.manual_uploads (customer_id,batch_id,filename,mime_type,status)
 values(p_customer,p_batch,left(p_filename,150),p_mime,'uploading') returning id into v_id;
 insert into public.manual_access_free_reservations(upload_id,customer_id) values(v_id,p_customer);
 return v_id;
end; $$;

create or replace function public.manual_free_confirm_upload(p_customer uuid,p_upload uuid,p_path text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 -- An already reserved upload may finish even if access is revoked mid-transfer.
 update public.manual_uploads
 set source_path=p_path,status='processing',updated_at=now()
 where id=p_upload and customer_id=p_customer and status='uploading' and id in (select upload_id from public.manual_access_free_reservations where customer_id=p_customer);
 if not found then raise exception 'Upload reservation unavailable'; end if;
 delete from public.manual_access_free_reservations where upload_id=p_upload and customer_id=p_customer;
 return true;
end; $$;

create or replace function public.manual_free_cancel_upload(p_customer uuid,p_upload uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_changed int;
begin
 delete from public.manual_uploads where id=p_upload and customer_id=p_customer and status='uploading' and id in (select upload_id from public.manual_access_free_reservations where customer_id=p_customer);
 get diagnostics v_changed=row_count;
 return v_changed>0;
end; $$;

create or replace function public.manual_free_cleanup_uploads(p_customer uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_changed int;
begin
 delete from public.manual_uploads u
 where u.customer_id=p_customer and u.status='uploading' and u.created_at<now()-interval '20 minutes'
 and u.id in (select r.upload_id from public.manual_access_free_reservations r where r.customer_id=p_customer);
 get diagnostics v_changed=row_count;
 return v_changed;
end; $$;

create or replace function public.manual_free_reserve_ai(p_customer uuid,p_image boolean,p_chat_max int,p_image_max int)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_used int; v_max int;
begin
 -- Serialize the site-wide image spend cap and individual quota checks.
 perform pg_advisory_xact_lock(42627753);
 perform 1 from public.manual_access_grants where customer_id=p_customer and active for update;
 if not found then raise exception 'Complimentary access has ended'; end if;
 v_max:=case when p_image then least(greatest(p_image_max,1),10)
             else least(greatest(p_chat_max,1),30) end;
 select count(*) into v_used from public.manual_access_ai_calls
 where customer_id=p_customer and is_image=p_image and created_at>now()-interval '24 hours';
 if v_used>=v_max then raise exception 'Daily complimentary AI limit reached. Please try tomorrow.'; end if;
 if p_image and (select count(*) from public.manual_access_ai_calls where is_image and created_at>now()-interval '24 hours')>=100 then
  raise exception 'Site-wide complimentary AI image safety limit reached';
 end if;
 insert into public.manual_access_ai_calls(customer_id,is_image) values(p_customer,p_image);
 return true;
end; $$;

-- Lock down all direct access to the data and RPCs. ONLY Cloudflare service role may invoke.
alter table public.manual_access_grants enable row level security;
alter table public.manual_access_ai_calls enable row level security;
alter table public.manual_access_free_reservations enable row level security;
revoke all on public.manual_access_grants,public.manual_access_ai_calls,public.manual_access_free_reservations from public,anon,authenticated;
grant select,insert,update,delete on public.manual_access_grants,public.manual_access_ai_calls,public.manual_access_free_reservations to service_role;
revoke all on public.manual_customer_gallery from public,anon,authenticated;
grant select on public.manual_customer_gallery to service_role;

do $$declare f text;
begin
 for f in select p.oid::regprocedure::text from pg_proc p
 join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('manual_free_reserve_upload','manual_free_confirm_upload','manual_free_cancel_upload','manual_free_cleanup_uploads','manual_free_reserve_ai')
 loop
  execute 'revoke all on function '||f||' from public,anon,authenticated';
  execute 'grant execute on function '||f||' to service_role';
 end loop;
end $$;

notify pgrst, 'reload schema';
