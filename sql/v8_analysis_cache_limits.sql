-- Athave AI V8: add a tiny, private analysis request cache and abuse guard.
-- Run in the SAME Supabase project before deploying the V8 website.
-- Does NOT touch, remove, or reset existing customers, wallets, jobs, payments or redeem codes.

create table if not exists public.analysis_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  fingerprint text not null check(length(fingerprint) between 40 and 70),
  detected_items jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (customer_id, fingerprint)
);
create index if not exists analysis_requests_daily on public.analysis_requests(customer_id, created_at desc);
alter table public.analysis_requests enable row level security;
revoke all on table public.analysis_requests from public, anon, authenticated;
grant select, insert, update on table public.analysis_requests to service_role;

create or replace function public.start_analysis_request(
 p_customer uuid,p_fingerprint text,p_daily_max int default 12
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_rec public.analysis_requests%rowtype; v_exists boolean:=false;
begin
 if length(coalesce(p_fingerprint,'')) not between 40 and 70 then raise exception 'Invalid analysis request'; end if;
 if not exists (select 1 from public.customers where id=p_customer) then raise exception 'Unknown user'; end if;
 perform pg_advisory_xact_lock(42627642);
 select * into v_rec from public.analysis_requests
 where customer_id=p_customer and fingerprint=p_fingerprint for update;
 v_exists:=found;
 if v_exists then
   if v_rec.detected_items is not null then
     return jsonb_build_object('cached',true,'items',v_rec.detected_items);
   end if;
   if v_rec.created_at > now()-interval '2 minutes' then
     raise exception 'Analysis already in progress. Wait a moment before retrying.';
   end if;
 end if;
 if (select count(*) from public.analysis_requests
     where customer_id=p_customer and created_at > now()-interval '24 hours') >= least(30,greatest(1,p_daily_max)) then
   raise exception 'Daily analysis limit reached. Try again later.';
 end if;
 if (select count(*) from public.analysis_requests
     where customer_id=p_customer and created_at > now()-interval '20 seconds') > 0 then
   raise exception 'Please wait 20 seconds before analyzing different photos.';
 end if;
 if v_exists then
   update public.analysis_requests
   set created_at=now(),completed_at=null,detected_items=null
   where id=v_rec.id;
 else
   insert into public.analysis_requests(customer_id,fingerprint) values(p_customer,p_fingerprint)
   returning id into v_rec.id;
 end if;
 return jsonb_build_object('cached',false,'requestId',v_rec.id);
end; $$;

create or replace function public.finish_analysis_request(p_request uuid,p_items jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 4 then
   raise exception 'Invalid product analysis';
 end if;
 update public.analysis_requests
 set detected_items=p_items,completed_at=now()
 where id=p_request and detected_items is null;
 return found;
end; $$;

revoke all on function public.start_analysis_request(uuid,text,int) from public,anon,authenticated;
revoke all on function public.finish_analysis_request(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.start_analysis_request(uuid,text,int) to service_role;
grant execute on function public.finish_analysis_request(uuid,jsonb) to service_role;
