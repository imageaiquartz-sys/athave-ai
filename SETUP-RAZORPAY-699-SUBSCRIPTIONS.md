# Athave AI — ₹699/month Razorpay subscriptions (V24)

## What changed
- The customer-facing site now offers **one** plan: ₹699/month, automatically renewing through Razorpay.
- Each successfully charged monthly billing cycle unlocks **unlimited original photo uploads** with **up to 10 images in a single batch**. Further batches are unlimited during the paid term. No one-time top-up packs remain for sale.
- Monthly billing cycles come from Razorpay's `subscription.charged` event, not browser callbacks or client clocks. Billing webhooks and duplicate-delivery protection use an atomic Supabase SQL function.
- Existing paid membership records, uploaded files, and previously placed one-time orders are left intact. The old purchase endpoints return HTTP 410; already pending old payments can still be reconciled if they complete.
- Customers may stop future renewals from **Plans**. They keep paid access through the current successful billing period.

**This merchant supplied a LIVE key and LIVE plan ID. See `LIVE-RAZORPAY-DEPLOY.md` for the correct production settings, credential rotation and deployment checklist.**

## Before deploying (required)

1. In **Supabase SQL Editor**, if not already run, execute `sql/V24-Razorpay-699-Subscription.sql` after V16/V17/V22/V23. Then **always run `sql/V27-Unlimited-699-Pro-Access.sql` after V24**. V27 removes the monthly 50-upload cap and locks Pro unless a captured ₹699 charge covers the current paid period. Both migration files are necessary for a fresh setup.
2. In Razorpay Dashboard, enable **Subscriptions** / **recurring payments** for the actual merchant and website (https://athave.in) if not already enabled. Confirm your merchant's supported UPI AutoPay/card/e-mandate methods.
3. In Razorpay **Test Mode → Subscriptions → Plans**, create exactly one plan:
   - **Plan name:** Athave AI Monthly
   - **Billing frequency:** Monthly / every **1** month
   - **Currency:** INR
   - **Amount:** **₹699** (69900 paise)
   - No trial, setup fee, or add-ons.
   - Copy the generated Plan ID (`plan_...`). Live mode needs its own separate matching plan.
4. Cloudflare Pages → Athave AI project → **Settings → Variables and Secrets**. Set the following for Production / Preview as appropriate:

   | Variable | Value | How to store |
   |---|---|---|
   | `RAZORPAY_KEY_ID` | matching Razorpay Test/Live Key ID, `rzp_test_...` or `rzp_live_...` | Environment variable |
   | `RAZORPAY_KEY_SECRET` | matching Razorpay Test/Live API Key Secret | **Encrypted secret** |
   | `RAZORPAY_SUBSCRIPTION_PLAN_ID` | matching `plan_...` from the same Razorpay mode | Environment variable |
   | `RAZORPAY_WEBHOOK_SECRET` | a strong webhook secret you create (same value used in the Razorpay webhook configuration) | **Encrypted secret** |
   | `PAYMENTS_ENABLED` | `false` while setting up, change to `true` for tests after SQL + webhook setup | Environment variable |

   Keep all private key material out of GitHub, the ZIP, frontend JavaScript, chats and screenshots.

5. Razorpay Dashboard → Webhooks → Add webhook:
   - **URL:** `https://athave.in/api/webhooks/razorpay` (or the actual domain used for test).
   - **Events:** `subscription.charged`, `subscription.authenticated`, `subscription.activated`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.paused`, `subscription.resumed`, `subscription.completed`, `subscription.updated` (and optionally `payment.captured` to process already pending legacy orders).
   - **Secret:** the exact value configured as `RAZORPAY_WEBHOOK_SECRET`.
   - Configure separate Test and Live mode webhooks and matching secrets.
6. Deploy this ZIP's source to your Cloudflare Pages GitHub repository (build command `exit 0`, output directory `public`). Update `PAYMENTS_ENABLED` to `true` and redeploy in Test Mode.
7. Test a subscription end to end with a verified phone account. Confirm `subscription.charged` was received, one row was created in `manual_subscription_charges`, `manual_memberships` has the legacy compatibility value `upload_cap=2147483647` (no monthly cap is enforced), a duplicate webhook does not extend membership twice, `Cancel automatic renewal` stops future charges, and the account retains paid access through its current paid cycle.
8. When verified, create a distinct **Live Mode** plan, switch all environment keys, plan ID and webhook secret to the live values together, then test a real controlled subscription. **Never mix Test and Live IDs or secrets.**

## Security and behavior
- The app verifies Razorpay webhook HMAC signatures over the raw request body.
- Subscription Checkout verification uses HMAC-SHA256(`payment_id|subscription_id`) with `RAZORPAY_KEY_SECRET` and confirms the subscription belongs to the signed-in account; it does not activate service based only on the checkout callback.
- Successful recurring charges must be **captured**, **INR 69900**, belong to the configured plan, and contain a valid monthly cycle. Only then does the atomic database RPC activate a paid period. There is no monthly upload quota; only the 10-photos-per-batch limit.
- The SQL function applies each `gateway_payment_id` once. Delayed old-cycle events never overwrite a newer billing cycle.
- The backend requires Pro for **new Upload submissions** and **AI Studio requests**, while every page remains visible without payment. Signed-in owners can still view previously uploaded and delivered files after expiry. Profile and billing remain accessible for renewal. Admin-granted complimentary access still works.
- If Razorpay is not configured, billing **remains unavailable**; code alone does not activate subscriptions.
- Razorpay's current subscription API requires a finite `total_count`. The integration sets 120 monthly cycles (up to 10 years), not infinite billing. Customers can subscribe again afterward.
- Cancel-at-cycle-end applies to active paid cycles; an unbilled `created`/`authenticated` mandate is canceled immediately if Razorpay does not yet have an active billing cycle.

## Account owner checklist
The current Live Key ID and Live Plan ID are documented in `LIVE-RAZORPAY-DEPLOY.md`. Rotate previously exposed secrets (including the new Key ID if a new pair is generated); do not share private values in chat. Store them directly in Cloudflare encrypted secrets.
