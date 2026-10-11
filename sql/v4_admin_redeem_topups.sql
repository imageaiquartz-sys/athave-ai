-- Athave AI V4: admin dashboard, one-time ₹499/₹999/custom top-ups, secure redeem codes.
-- Run ONCE on your existing StudioWhite Supabase project BEFORE uploading V4 to GitHub.
-- Does NOT delete any customers, payments, wallets, or generations.
BEGIN;

-- Legacy payments (including the old ₹299 pack) are preserved in the database.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_plan_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_plan_check
  CHECK (plan IN ('starter','topup','premium','custom'));

CREATE TABLE IF NOT EXISTS public.redeem_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text UNIQUE NOT NULL CHECK (length(code_hash) BETWEEN 40 AND 100),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 2 AND 70),
  credits integer NOT NULL CHECK (credits BETWEEN 1 AND 10000),
  max_uses integer NOT NULL CHECK (max_uses BETWEEN 1 AND 10000),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= max_uses),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES public.customers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.redeem_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.redeem_codes(id),
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  credits integer NOT NULL CHECK (credits > 0),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code_id,customer_id)
);
CREATE INDEX IF NOT EXISTS redeem_uses_customer_idx ON public.redeem_uses(customer_id,redeemed_at DESC);
ALTER TABLE public.redeem_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redeem_uses ENABLE ROW LEVEL SECURITY;

-- Atomic redeem: row lock prevents concurrent reuse or overspending.
CREATE OR REPLACE FUNCTION public.redeem_image_code(p_customer uuid,p_code_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_code public.redeem_codes%ROWTYPE; v_balance int;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=p_customer) THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  SELECT * INTO v_code FROM public.redeem_codes WHERE code_hash=p_code_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Redeem code not found'; END IF;
  IF NOT v_code.active OR v_code.expires_at <= now() THEN RAISE EXCEPTION 'This redeem code has expired or is disabled'; END IF;
  IF v_code.uses >= v_code.max_uses THEN RAISE EXCEPTION 'This redeem code is fully used'; END IF;
  IF EXISTS(SELECT 1 FROM public.redeem_uses WHERE code_id=v_code.id AND customer_id=p_customer) THEN
    RAISE EXCEPTION 'You have already redeemed this code';
  END IF;
  INSERT INTO public.redeem_uses(code_id,customer_id,credits) VALUES (v_code.id,p_customer,v_code.credits);
  UPDATE public.redeem_codes SET uses=uses+1 WHERE id=v_code.id;
  INSERT INTO public.wallets(customer_id) VALUES(p_customer) ON CONFLICT DO NOTHING;
  UPDATE public.wallets SET balance=balance+v_code.credits,purchased=purchased+v_code.credits,updated_at=now()
  WHERE customer_id=p_customer RETURNING balance INTO v_balance;
  RETURN jsonb_build_object('credits',v_code.credits,'balance',v_balance);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_totals()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object(
  'users',(SELECT count(*) FROM public.customers),
  'paid_orders',(SELECT count(*) FROM public.payments WHERE status='paid'),
  'revenue_paise',(SELECT coalesce(sum(amount_paise),0) FROM public.payments WHERE status='paid'),
  'redemptions',(SELECT count(*) FROM public.redeem_uses)
 );
$$;

REVOKE ALL ON TABLE public.redeem_codes,public.redeem_uses FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.redeem_codes,public.redeem_uses TO service_role;
REVOKE ALL ON FUNCTION public.redeem_image_code(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_dashboard_totals() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_image_code(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_totals() TO service_role;
COMMIT;

-- Make YOUR existing, OTP-verified account an admin once you have signed in:
-- UPDATE public.customers SET is_admin=true WHERE phone='91YOUR10DIGITNUMBER';
-- Do NOT run a broad UPDATE without the WHERE clause.

-- Optional verification query:
SELECT has_table_privilege('service_role','public.redeem_codes','SELECT') AS admin_tables_ok,
       has_function_privilege('service_role','public.redeem_image_code(uuid,text)','EXECUTE') AS redeem_function_ok;
