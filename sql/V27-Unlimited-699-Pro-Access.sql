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
