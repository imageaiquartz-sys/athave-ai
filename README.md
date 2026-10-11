# Athave AI V4 — one-time top-ups + secure admin + redeem codes

**No Replit, VS Code, or Node hosting required.** This update replaces V3 in your existing GitHub-linked Cloudflare Pages project. It retains existing Supabase customers, OTP login, Razorpay gateway, image uploads, private history, Gemini API integration and current Cloudflare secrets. **Do not delete the Supabase database or run `sql/setup.sql` again on your live project.**

## IMPORTANT: Database migration FIRST

Before uploading V4 to GitHub:

1. Open **Supabase → StudioWhite → SQL Editor → New query**.
2. Copy and **Run `sql/v4_admin_redeem_topups.sql`**. This safely updates the payment plan constraint and creates secure redeem-code tables and RPCs. It does not remove existing customer or payment records, and it keeps RLS enabled.
3. **Make your own verified mobile account an admin.** You must already have logged in via OTP and completed your name. Run this with YOUR number, including `91`:

   ```sql
   UPDATE public.customers SET is_admin = true
   WHERE phone = '91YOUR10DIGITNUMBER';
   ```

   Check the result:

   ```sql
   SELECT phone, name, is_admin FROM public.customers
   WHERE phone = '91YOUR10DIGITNUMBER';
   ```

   Expected `is_admin = true`. Never omit `WHERE`, or you could make every account an admin.
4. Log out and sign back in if necessary, or refresh `/profile/`. The **Admin** badge will appear in the header and the **Admin dashboard** card will appear in Profile. Visit `/admin/`.

**Security:** the admin backend checks `customers.is_admin` for EVERY admin request. Hiding the badge is only a UX feature; it does not confer permissions. Redeem codes are server-generated from crypto randomness and stored in the database as SHA-256 hashes. Redemption is a transaction with database row locking, a maximum-uses counter and a unique per-customer redemption constraint. The code is shown only once at creation. The admin can disable any active code from the dashboard.

## Deploy on the current GitHub and Cloudflare Pages

1. Extract the ZIP, upload **its contents** (not the ZIP itself) over your existing `athave-ai` repository on `main`: `public`, `functions`, `sql`, and `README.md`.
2. Commit changes and wait for **Cloudflare Pages → Deployments → Success**.
3. Keep Cloudflare build settings: Framework `None`, Build command `exit 0`, output directory `public`, root directory repository root.
4. Keep all your existing Supabase, MSG91 and Razorpay variables unchanged. Normally, no new Cloudflare variables are needed for admin and redeem-code features.
5. On mobile, refresh the deployed site (or open an incognito tab if stale assets appear).

## Pages

- `/` — home with **only the white polo and earbuds**, no sneaker; no upload box on homepage.
- `/create/` — **one product image** and optional second reference, automatic product detection; no product-type selector or explanatory garment message.
- `/results/` — separate high-quality product images and downloadable 1024×1024 WebP files; Download all ZIP.
- `/profile/` — identity, wallet, **Redeem a code**, activity links and **Admin dashboard link only for admins**.
- `/admin/` — totals, customers, paid/pending top-ups, create/disable redeem codes.
- `/profile/history/`, `/profile/payments/` and About / Terms / Privacy / Refunds / Contact / How.

## Pricing: ONE-TIME TOP-UPS ONLY

- **₹499** top-up → **30 image credits**.
- **₹999** top-up → **60 image credits**.
- **Custom ₹100–₹10,000** → `floor(amount × 30 / 500)` credits.
- The former ₹299 checkout option is **removed**. Historical ₹299 payments are preserved in payment history.
- No subscriptions, recurring deductions or automatic renewals. Credits are granted **only after captured Razorpay payments verified server-side**, or through a valid redeem code. One generated output consumes one credit. Generation failures normally refund reserved credits.

## AI generation

Set Cloudflare Production variables:

| Variable | Suggested value |
|---|---|
| `GEMINI_API_KEY` | Your funded Google AI Studio key (**Secret**) |
| `GEMINI_IMAGE_MODEL` | `gemini-3.1-flash-lite-image` |
| `ANALYSIS_MODEL` | `gemini-3.5-flash-lite` |
| `GENERATION_ENABLED` | `false` until ready to test, then `true` |
| `AI_MONTHLY_CALL_CAP` | `20` during the first test |
| `MAX_GENERATIONS_PER_DAY` | `5` during the first test |

These are **existing app variables**, not required for the admin setup. Leave payments in Razorpay Test Mode until verified. Google AI model names and prices may change: check https://ai.google.dev/gemini-api/docs/models and https://ai.google.dev/gemini-api/docs/pricing.

After uploading, sign in and open `https://athave-ai.pages.dev/api/ai/check` to check key/model metadata. This does NOT verify a paid image generation; you must run one actual test with at least one credit. WebP optimization happens in the browser on download, up to a few hundred KB where feasible; complex pictures may require more KB. AI-inferred unseen garment details may not match the actual product.

## End-to-end checklist

- [ ] SQL V4 migration successfully completed, admin account set correctly
- [ ] Cloudflare production deployment successful
- [ ] Homepage contains **two** product images (polo + earbuds)
- [ ] `/create/` shows no product dropdown or descriptive garment note
- [ ] Existing phone OTP and account persist when navigating between pages
- [ ] Admin badge only for a database admin
- [ ] Non-admin `/api/admin/overview` returns HTTP 403
- [ ] Admin dashboard loads customers, Razorpay top-ups and summary
- [ ] Admin creates a test code with 2 image credits and max uses 1
- [ ] Customer redeems it once and wallet balance increases by 2
- [ ] Second redemption fails; admin disables another unused code
- [ ] Test ₹499 and ₹999 orders in Razorpay Test Mode, including duplicate webhook delivery
- [ ] Run one real AI image generation and download white-backed 1024×1024 WebP

## Existing backend secrets (unchanged)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MSG91_WIDGET_ID`, `MSG91_AUTH_KEY`, `SESSION_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

**Note:** Real Supabase, MSG91, Razorpay and Gemini connections were not exercised in this local packaging environment. Your payment and refund policy is a draft that should be reviewed against your actual business terms before launching live payments.


## V5 update: admin ID, spacing, opaque homepage photography

- Existing mobile OTP verification and Supabase `is_admin` remain essential. The admin ID is **not** a way for arbitrary visitors to become admins.
- In Cloudflare > Workers & Pages > athave-ai > Settings > Variables and secrets, add **Secret** `ADMIN_ACCESS_ID` with value **`Tefter`** (case-sensitive). Save for Production and redeploy.
- Visit `/admin/` while signed in with the customer phone you marked `is_admin=true` in Supabase. You'll see an **Admin ID** field (no password field); enter `Tefter`. A server-signed HttpOnly unlock cookie is valid for 12 hours and tied to that OTP session. Ordinary users cannot unlock.
- Updated site retains all the prior endpoints and tables. **No new SQL migration is needed for V5.**
- V6 restores the two original catalogue photos as independent, normal HTML images (`athave-shirt.webp` and `athave-earbuds.webp`). No image eraser, masking, transparent composite or multiply blending is used. The transparent logo is rebuilt from the original unbroken wordmark, with the new gap **only** between the unicorn and the full name.
- Creator has a larger wallet limit card and more margin above and below it.
- Remove old V4 and V3 frontend files by replacing the repository contents with this whole folder. Do not delete existing Cloudflare secrets or Supabase data.


## V6 quick correction — header logo and hero image

- Fixed the V5 wordmark bug that inserted a gap between `At` and `haveAI`. **`AthaveAI` is intact.** The space appears only between the unicorn icon and the complete brand name.
- Removed `athave-hero-opaque.webp` and `athave-earbuds-cutout.webp` along with all composite image styles.
- The homepage uses the **original** white polo and white earbuds image files with normal CSS layering (no masks, transparency changes, pixel erasing or multiply blend).
- No change to your existing admin ID, OTP, Razorpay, Supabase or Gemini backend code. No new secrets or SQL required.
- Upload the extracted content to the same `main` GitHub branch and allow Cloudflare Pages to redeploy. Hard refresh Ctrl+Shift+R after deploying to clear cached logo/assets.
