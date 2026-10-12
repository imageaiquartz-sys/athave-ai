# Athave AI V11 – installable PWA + Razorpay setup

## PWA

Upload ALL files in this package to `imageaiquartz-sys/athave-ai` main branch, preserving folders. Cloudflare Pages build command: `exit 0`; output directory `public`.

Install tests:
- `https://athave.in/manifest.webmanifest` → valid JSON
- `https://athave.in/icons/icon-192.png` and `/icons/icon-512.png` → real PNG square images
- `https://athave.in/sw.js` → Javascript
- Chrome/Edge → install app icon in address bar, or homepage Install app button once browser makes it available
- iPhone → Safari Share → Add to Home Screen
- Start installed Athave AI; home/studio/profile should work online. Offline displays a simple reconnect page. No user/payment data cached.

## Razorpay: existing merchant account

You may use the same Razorpay account and credentials ONLY if the merchant represents the same authorized business and Razorpay approves `https://athave.in` and the AI image-editing service for that merchant. Add/update the website URL and public Contact/Privacy/Terms/Refunds pages in the Razorpay dashboard, and ask Razorpay support to approve/associate the site if your existing account covers another brand/activity. Never put API secrets in GitHub, chat messages or browser JS.

### Test mode first

1. Razorpay Dashboard → Settings/Account & Settings → API Keys, switch to Test Mode, generate/copy test Key ID and Key Secret.
2. Razorpay Dashboard → Webhooks → Add New Webhook. URL: `https://athave.in/api/webhooks/razorpay`. Set a new random webhook secret. Subscribe to `payment.captured` (and optionally `payment.failed` for logs, not crediting). Create a matching webhook in Live Mode later.
3. Cloudflare Workers & Pages → athave-ai → Settings → Variables and Secrets → Production; add encrypted secrets:
   - `RAZORPAY_KEY_ID` = test `rzp_test_...` (secret storage recommended)
   - `RAZORPAY_KEY_SECRET` = its matching test secret (encrypted)
   - `RAZORPAY_WEBHOOK_SECRET` = your new webhook secret (encrypted)
   - `PAYMENTS_ENABLED` = `false` initially (Text)
4. Save/redeploy. Once webhook is set, set `PAYMENTS_ENABLED` = `true`, save/redeploy. Check `https://athave.in/api/config` reports `payments:true` (never reveals secrets).
5. Sign in with OTP and test a top-up using the Razorpay mock Test Mode checkout. Ensure exactly one wallet credit and `paid` status; webhook repeats must NOT double-credit. Check admin Payments dashboard and Razorpay transaction.

### Live mode

1. Get `athave.in` / AI photo credit service approved on your Razorpay merchant, enable automatic capture. For unrelated business entities use separate Razorpay merchant approval.
2. Generate **Live Mode** credentials. Update Cloudflare `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` together for the Live webhook; avoid mixed test/live values.
3. Keep `PAYMENTS_ENABLED=false` during the key switch; after all 3 values are saved, redeploy and switch to `true`.
4. Make one small controlled real-money transaction; check captured status in Razorpay, credits in wallet, and webhook delivery/retries. Only then invite customers to buy.

### Credit rates
- ₹499 starter = 30 credits, ₹999 premium = 60 credits
- Custom ₹100–₹10,000, credits = floor(amount×30/500)
- No subscription/recurring autopay. One captured payment triggers exactly one crediting operation, using the existing Supabase `credit_paid_order()` atomic database function.

### Notes
- This change does **not** alter existing Supabase tables or require SQL.
- Payment capture can be delayed. The frontend polls the authenticated payment status endpoint; webhook and status polling only credit after Razorpay confirms `captured`.
- If paid payment still shows pending, do not repeatedly pay; check Razorpay dashboard/webhook deliveries and Cloudflare logs.
- Actual live Razorpay activation, Cloudflare secrets and real transaction verification must be done by the account owner.

## Critical admin security before public payments

The old `/admin/` page uses the publicly known single ID `Tefter`; **that is not adequate authentication for phone numbers, payment records or redeem codes**. Before enabling Live payments, protect `/admin/*` **and** `/api/admin/*` using Cloudflare Access (email-based identity / MFA) or upgrade the admin login to genuine server-verified authentication with a long private credential and rate-limits. Do not treat a publicly shared admin ID as secure.
