-- Athave AI V23 - add ONCE in Supabase SQL Editor (after V22 migration).
-- Prevent repeat delivery: one atomic claim and one database transaction per original upload.
-- Existing orders, customers, gallery, and payment tables remain unchanged.

create table if not exists public.manual_delivery_claims (
 upload_id uuid primary key references public.manual_uploads(id) on delete cascade,
 claim_id uuid not null unique,
 expires_at timestamptz not null default (now()+interval '15 minutes'),
 created_at timestamptz not null default now()
);
create index if not exists manual_delivery_claims_expiry_idx on public.manual_delivery_claims(expires_at);
alter table public.manual_delivery_claims enable row level security;
revoke all on public.manual_delivery_claims from public, anon, authenticated;
grant select,insert,update,delete on public.manual_delivery_claims to service_role;

create or replace function public.manual_claim_delivery(p_upload uuid,p_claim uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_upload uuid;
begin
 -- Only processing uploads can be claimed. Lock this row for concurrent requests.
 select id into v_upload from public.manual_uploads
  where id=p_upload and status='processing' for update;
 if v_upload is null then return false; end if;
 insert into public.manual_delivery_claims(upload_id,claim_id,expires_at)
 values(p_upload,p_claim,now()+interval '15 minutes')
 on conflict (upload_id) do update
 set claim_id=excluded.claim_id,expires_at=excluded.expires_at,created_at=now()
 where public.manual_delivery_claims.expires_at<now();
 return found;
end;
$$;

create or replace function public.manual_complete_delivery(p_upload uuid,p_claim uuid,p_files jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_customer uuid;v_count int;
begin
 select customer_id into v_customer from public.manual_uploads
 where id=p_upload and status='processing' for update;
 if v_customer is null then raise exception 'Upload already delivered or unavailable';end if;
 perform 1 from public.manual_delivery_claims where upload_id=p_upload and claim_id=p_claim and expires_at>now() for update;
 if not found then raise exception 'Delivery claim expired. Refresh and retry';end if;
 if jsonb_typeof(p_files) is distinct from 'array' then raise exception 'Invalid delivery files';end if;
 v_count=jsonb_array_length(p_files);
 if v_count<1 or v_count>8 then raise exception 'Provide 1 to 8 result files';end if;
 if exists (select 1 from public.manual_outputs where upload_id=p_upload) then
   raise exception 'Finished files were already delivered';
 end if;
 if exists(
 select 1 from jsonb_to_recordset(p_files) as f(object_path text,filename text,mime_type text)
 where f.object_path is null or f.object_path not like v_customer::text||'/'||p_upload::text||'/result/%'
    or length(f.filename)<1 or length(f.filename)>150
    or f.mime_type not in ('image/jpeg','image/png','image/webp')
 ) then raise exception 'Invalid finished file metadata'; end if;
 insert into public.manual_outputs(upload_id,object_path,filename,mime_type)
 select p_upload,f.object_path,f.filename,f.mime_type
 from jsonb_to_recordset(p_files) as f(object_path text,filename text,mime_type text);
 update public.manual_uploads set status='completed',updated_at=now() where id=p_upload;
 delete from public.manual_delivery_claims where upload_id=p_upload and claim_id=p_claim;
end;
$$;

create or replace function public.manual_release_delivery(p_upload uuid,p_claim uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 delete from public.manual_delivery_claims where upload_id=p_upload and claim_id=p_claim;
end;
$$;

revoke all on function public.manual_claim_delivery(uuid,uuid) from public,anon,authenticated;
revoke all on function public.manual_complete_delivery(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.manual_release_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.manual_claim_delivery(uuid,uuid) to service_role;
grant execute on function public.manual_complete_delivery(uuid,uuid,jsonb) to service_role;
grant execute on function public.manual_release_delivery(uuid,uuid) to service_role;
