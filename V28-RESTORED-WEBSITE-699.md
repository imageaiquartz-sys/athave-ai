# Athave AI V28 — Original site restored, single ₹699/month Pro plan

## What changed
- The full-page subscription/paywall overlay that hid Upload, AI Studio and Gallery has been removed.
- All pages and navigation remain visible and usable, including when logged out, unpaid, cancelled or expired.
- Upload and AI Studio display only a small inline Pro message while inactive; no page is replaced with a subscription window.
- Non-Pro users can select 1–10 photos but **cannot submit them**; they can browse the rest of the page. Backend `POST /api/manual/upload` enforces paid access.
- AI Studio chat/image requests still require Pro, with enforcement server-side on `POST /api/manual/ai`.
- An authenticated customer can view past uploads, past finished gallery images, original/download files, and generated AI image files even after cancellation/expiry; the server verifies ownership before serving files.
- The single Razorpay subscription remains **₹699 per month**, unlimited uploads with a 10-image maximum per batch and 8MB/file. No other plan/topup is added.
- A signed, captured ₹699 Razorpay monthly charge is required to activate paid actions. A mandate authorization alone does not grant Pro.
- If the subscription is cancelled, the paid term stays active through the current paid period, then paid actions lock. Failed renewals/expired accounts cannot submit/upload/generate.

## Deployment
1. Deploy this V28 project to Cloudflare Pages (same build/deploy settings as existing project). It contains the updated versioned service worker and server handlers. Replacing *only* the static frontend will not restore expired customers' gallery access if the old API stays deployed.
2. **No new SQL is needed for V28**. If the previous V24/V27 repair migrations are not installed yet, run `sql/V27-FIX-MISSING-SUBSCRIPTION-TABLES.sql` first. On an already-correct V27.1 database, do not repeat migrations.
3. Keep Razorpay `RAZORPAY_SUBSCRIPTION_PLAN_ID` tied to a ₹699 INR monthly plan; keep payment secrets in encrypted Cloudflare variables.
4. Verify on the live environment: guest sees complete Upload/AI Studio/Gallery pages; unpaid signed-in customer can browse and see past photos but upload/AI submit returns Pro required; paid customer can submit two consecutive 10-photo batches; cancellation keeps paid access until cycle end; expiry stops new paid actions but keeps historic files available.

Only static/offline tests can run in this environment. Live payment, OTP and Supabase connectivity must be verified after deploy.
