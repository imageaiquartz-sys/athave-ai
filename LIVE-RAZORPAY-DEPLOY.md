# ATHAVE AI — LIVE ₹699 MONTHLY RAZORPAY DEPLOYMENT

## Live account details provided by merchant

- Razorpay mode: **LIVE**
- Current public Key ID: `rzp_live_Tn0Pk4Ja0vLjP9`
- Current Plan ID: `plan_Tp05Bb5bcDRGgs`
- Expected plan: INR ₹699.00 monthly (69,900 paise), one-month interval, no setup fees or topups.
- IMPORTANT: The plan amount and availability have NOT been verified against the account. The backend reads the Razorpay plan at checkout and rejects plans other than monthly ₹699.

## CRITICAL: ROTATE DISCLOSED SECRETS BEFORE PRODUCTION

Both the Razorpay API Key Secret and the webhook signing secret were shared in a chat. Treat both as compromised.
Regenerate the **Razorpay API key pair** in the Live Dashboard and replace **BOTH** `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` with the new matching values. The current Key ID above is only a reference and may become invalid upon rotation. Replace the webhook secret in Razorpay and Cloudflare with the same newly generated value. **Never paste private values into source code, GitHub, ZIPs, chat, or front-end assets.**

## Cloudflare Pages → athave-ai → Settings → Variables and Secrets → Production

| Name | Value | Setting |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_Tn0Pk4Ja0vLjP9` **only if still paired with a valid, secure API secret**; otherwise the NEW `rzp_live_...` Key ID | Plain environment variable |
| `RAZORPAY_KEY_SECRET` | Newly rotated matching LIVE secret (never put into repository) | **Encrypted secret** |
| `RAZORPAY_SUBSCRIPTION_PLAN_ID` | `plan_Tp05Bb5bcDRGgs` | Plain environment variable |
| `RAZORPAY_WEBHOOK_SECRET` | Newly rotated signing secret (same in Razorpay webhook setup) | **Encrypted secret** |
| `PAYMENTS_ENABLED` | `false` while deploying and validating; change to `true` only after SQL, webhook, testing | Plain environment variable |

**Other existing required values**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, and the MSG91 authentication settings must remain configured as before.

After changing Cloudflare variables/secrets, **redeploy** to apply them. Do not accidentally enable Live payments in Preview.

## Required SQL migration

Run `sql/V24-Razorpay-699-Subscription.sql` in Supabase SQL Editor **once** (after required prior migrations). It adds subscription tracking, payment idempotency and renewal upload counters. Save a database backup before applying it to the production database.

## LIVE webhook

1. Razorpay Dashboard → Account & Settings → Webhooks (in **Live** mode) → Add Webhook.
2. URL: `https://athave.in/api/webhooks/razorpay` **only if athave.in is the actual deployed domain**; otherwise use `https://YOUR-DOMAIN/api/webhooks/razorpay`.
3. Select: `subscription.charged`, `subscription.authenticated`, `subscription.activated`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.paused`, `subscription.resumed`, `subscription.completed`, `subscription.updated`. Optionally `payment.captured` for remaining older one-time orders.
4. Set the same newly generated `RAZORPAY_WEBHOOK_SECRET` in Razorpay and Cloudflare. Save and check delivery logs.

## Preflight before enabling real billing

1. Confirm the live plan shows **₹699 INR**, period **monthly**, interval **1**, no add-ons/trial.
2. Verify your Razorpay merchant account is approved for Subscriptions and relevant payment methods are enabled.
3. Test the exact flow on **separate Test Mode keys and Test Mode plan**, not a live key or plan.
4. Validate first payment, genuine `subscription.charged` webhook, 50 upload credits, duplicate webhook idempotency, renewals, failure and cancellation behavior. Confirm Supabase tables have correct entries.
5. With new, secure Live credentials, change `PAYMENTS_ENABLED` to `true`, redeploy and make **one supervised real subscription purchase**. Expect an actual ₹699 charge; use a payment method you control, confirm details before paying.

## Scope / limitations

- Website offers only the ₹699/month automatic recurring plan, without additional top-ups.
- Existing manual paid memberships are retained until they expire; no forced extra charge.
- Each successful monthly charge grants the existing 50 uploads for the month; no new uploads credited merely from checkout success.
- Razorpay API requires `total_count`, currently set to **120 monthly cycles** (maximum ten years); it is not literally indefinite.
- The ZIP contains public IDs but **no private secrets**. Nothing has been deployed, no subscription plan details have been read from your Razorpay account, and no real charge has been attempted.
