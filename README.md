# Athave AI — GitHub + Cloudflare Pages full website

**Replit is not used or required.** Frontend: HTML/CSS/vanilla JavaScript. Backend: Cloudflare Pages Functions in `/functions/api/[[path]].js`. Database and image storage: Supabase. Phone OTP: MSG91 Widget server APIs. Payments: Razorpay. AI: Google Gemini.

This repository is an UPDATE for the existing `athave-ai` GitHub/Cloudflare deployment. It contains **all site files**, rather than only changed snippets, so you can replace the previous project code without losing features. The source has been syntax checked and the OTP/account/session endpoints have passed local mocked integration tests. **Live SMS delivery, merchant payments, cloud storage and actual image-generation have not been verified against your accounts** and must be tested before accepting customers.

## Update your existing GitHub project (no Replit)

1. Extract this ZIP on your computer; do **not** upload the ZIP itself as a single repository file.
2. Open GitHub → your `athave-ai` repository → branch `main` → **Add file → Upload files**.
3. Upload the **contents** of the extracted folder, keeping `public/`, `functions/`, `sql/`, and `README.md` in the repository root. Choose to replace existing files with the same paths. Existing Cloudflare secrets are not in this ZIP and will not be overwritten.
4. Commit your changes to `main` and wait for Cloudflare Pages → Deployments → **Success**. The Git connection should trigger a deploy automatically.
5. In Cloudflare Pages, the build settings should remain `Framework: None`, `Build command: exit 0`, `Output directory: public`, `Root: /`.
6. If the browser displays an older site, open a fresh private/incognito tab to avoid cached JavaScript. Do not change the Cloudflare project/domain; it can remain `athave-ai.pages.dev`.

## Database and OTP patch

- If you already ran both **`sql/setup.sql`** and **`sql/otp_rate_limit_patch.sql`** previously, **do not run or replace the database**. All existing customer records, wallet balances, payments and generated images remain in Supabase.
- If you never ran `sql/otp_rate_limit_patch.sql`, run this additional SQL in your existing Supabase SQL Editor once. The original setup.sql was for initial setup only.
- Check Supabase Storage has a **private** bucket `athave-results`.

## Cloudflare Pages → Settings → Variables and Secrets (Production)

All previously added secrets remain in Cloudflare; this update **does not require regenerating keys**. The exact variable names are:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<ENCRYPTED>
MSG91_WIDGET_ID=366a6b694b72373637383033
MSG91_AUTH_KEY=<ENCRYPTED>
SESSION_SECRET=<ENCRYPTED_RANDOM_SECRET>
MSG91_WIDGET_TOKEN=<OPTIONAL_NOT_USED_BY_SERVER_OTP>
GEMINI_API_KEY=<ENCRYPTED>
GEMINI_IMAGE_MODEL=gemini-nano-banana-2.1
ANALYSIS_MODEL=gemini-2.5-flash
RAZORPAY_KEY_ID=<TEST_OR_LIVE_KEY_ID>
RAZORPAY_KEY_SECRET=<ENCRYPTED>
RAZORPAY_WEBHOOK_SECRET=<ENCRYPTED>
GENERATION_ENABLED=false
AI_MONTHLY_CALL_CAP=20
MAX_GENERATIONS_PER_DAY=10
```

Use `/api/config` to check whether the backend has the minimum login/payments/AI configuration. This endpoint never returns secret values. **Remove `/rest/v1/` from `SUPABASE_URL`**. Use **Secret** for all privileged keys.

### Important: Login and name completion fix

Previously, browser code could silently mark an authenticated user as logged out whenever `/api/me` failed due to a transient database error, then ask for OTP again at Generate. The updated site now explicitly waits for the server account response before dismissing login, preserves the correct authentication state, and shows a meaningful error if the verified account still cannot be loaded. Session cookies are HttpOnly, Secure and SameSite=Lax. The backend now has a minimal diagnostic endpoint: `GET /api/auth/session` (returns `authenticated: true` only when a valid stored account session exists; never reveals full phone).

**If OTP verifies but the new account still isn't created**, check the status/error shown beneath the name field and Cloudflare Pages → Functions logs. In Supabase → Table Editor verify `customers` and `wallets` rows were created. Never fake OTP success or manually add arbitrary session cookies to work around a provider verification failure.

### Test flow

1. Visit site in a private tab, enter phone → **Send OTP** → receive SMS → verify actual code.
2. For first-time user, enter name once. Do not proceed to paid top-up until the profile icon appears.
3. Tap the person/profile SVG in the top right. Confirm name and phone, image limit, image history and payment history are visible.
4. Refresh page: same account should remain signed in. Click Generate with photo uploaded: **it must not ask for OTP again** (but may ask for a top-up when limit is zero).
5. Sign out, then verify Generate requires login again. For returning verified number, the name step should not reappear.
6. Complete a Razorpay **Test Mode** top-up and verify exactly one wallet grant. A captured payment webhook uses `/api/webhooks/razorpay`.
7. Only when Gemini model access, wallet and storage are proven, enable `GENERATION_ENABLED=true` and test one real image; charges apply. A photo of shirt + pants can create four separate outputs and consume four image credits.

## Website improvements in this ZIP

- Modern black/white homepage with the **transparent** Athave AI unicorn + exact brand name mark.
- White polo and earbuds examples based on your supplied reference product images, with optimized pure-white-background WebP assets.
- Profile SVG in the header; account panel, wallet limit, history and sign out.
- Distinct pages at `/about/`, `/terms/`, `/privacy/`, `/refunds/`, `/contact/`.
- Founder shown **only** in About; footer retains Quartz Web Solutions developer link but does not show founder.
- Backend-side verified MSG91 OTP, Razorpay captured-payment check, one-time payment crediting, private image storage, 1024 × 1024 WebP conversion for downloads.

## Before accepting actual payments

1. Enter real business customer-support email, phone and operator address on `public/contact/index.html`. The package deliberately does not invent these details.
2. Read and adapt the included policies to your actual business/refund practices and legal requirements. They are drafts, not legal advice.
3. Have Razorpay merchant onboarding approved and use Live credentials only after test payment capture/refund scenarios work.
4. Price real Gemini calls (including analysis and multi-output requests) before promising a percentage profit. Each output is a separately billed AI request, and failed generations can incur upstream charges.
5. Re-check domain, policy links and `sitemap.xml` when moving to a custom domain.

## Files

```
public/index.html         Homepage and creator interface
public/styles.css         Brand design, mobile layout and shared legal pages
public/app.js             Client, login, uploads, wallet, Razorpay UI and WebP conversion
public/assets/           Transparent unicorn brand images and white-background product examples
public/about/index.html   About + founder + Quartz Web Solutions
public/terms/index.html   Terms and payment conditions
public/privacy/index.html Personal data policy
public/refunds/index.html Refund and cancellation terms
public/contact/index.html Support contact instructions
functions/api/[[path]].js Cloudflare Pages backend
sql/setup.sql             Initial schema (do not reset live DB)
sql/otp_rate_limit_patch.sql Additional OTP protection schema (run only if not already applied)
```

All generated outputs should be checked for accuracy. The back view of a garment that wasn't photographed is **inferred** by AI and cannot be guaranteed to match the original. WebP size varies with content; the export aims to stay small without promising a fixed KB size.
