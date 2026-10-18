# Athave AI — V27 Pro Monthly Subscription

**Current customer plan: ₹699/month via Razorpay. Unlimited manual photo uploads in batches of up to 10 images (8 MB each).** There is no 50-photo monthly allowance or add-on pack.

Every website page stays visible, including Upload, AI Studio and Gallery. **Submitting new uploads and sending AI Studio requests require a successfully paid** ₹699/month Pro subscription (or an admin grant); the server verifies access for every paid action. Existing private uploads, delivered gallery images and AI-generated files remain viewable by their verified owner after expiration. Unpaid authorisation does not activate Pro. Cancelling renewal preserves paid actions through the current paid period; expiry blocks only new paid actions. AI Studio has independent daily fair-use limits.

## Required deployment

**Read `V27-DEPLOY-UNLIMITED-PRO.md` FIRST.** This requires both the previous recurring subscription migration (`sql/V24-Razorpay-699-Subscription.sql`) **and the new `sql/V27-Unlimited-699-Pro-Access.sql`** in Supabase; run V27 last. Deploy the `public/` folder and `functions/` API together to Cloudflare Pages.

Detailed Razorpay setup: `SETUP-RAZORPAY-699-SUBSCRIPTIONS.md` and `LIVE-RAZORPAY-DEPLOY.md`. Keep secrets encrypted and outside source control. Older V16/V17/V22 documents and one-time payment guides are archived history, not the current pricing policy.

Pages: `/`, `/create/`, `/gallery/`, `/ai/`, `/topup/`, `/profile/`, `/profile/payments/`, `/admin/`.

Offline checks: `node tests/v27-static-and-entitlement.cjs`.


## V27.1 missing subscription_charges fix
If Supabase says `relation "public.manual_subscription_charges" does not exist`, run the **whole** `sql/V27-FIX-MISSING-SUBSCRIPTION-TABLES.sql` in SQL Editor. This one-step V27.1 repair bootstraps the missing V24 subscription tables before applying unlimited photo upload logic. Baseline V16 tables must already exist; no destructive schema reset. See `V27-DEPLOY-UNLIMITED-PRO.md`.
