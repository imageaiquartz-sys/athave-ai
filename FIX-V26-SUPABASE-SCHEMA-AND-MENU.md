# Athave AI V26 — missing subscription schema + Gallery menu dot

## What happened
The API returned Supabase PostgREST `PGRST205`: `public.manual_subscriptions` is missing from the database schema cache. The V24 Razorpay migration in the prior ZIP was **not yet executed in the deployed Supabase project**. This is not a Razorpay Key ID error and not a Gallery cache issue.

## Required to complete the fix (one-time database action)
1. Open https://supabase.com/dashboard and select the Athave AI database project that matches your deployed `SUPABASE_URL`.
2. SQL Editor → New query.
3. Paste the ENTIRE contents of `sql/V24-Razorpay-699-Subscription.sql` and run it. Do not run `sql/setup.sql` or delete existing tables.
4. Verify in Table Editor that `public.manual_subscriptions` and `public.manual_subscription_charges` are present. If needed run `NOTIFY pgrst, 'reload schema';` in SQL Editor to refresh Supabase PostgREST's schema cache.
5. Confirm earlier V16/V17/V22/V23 migrations were applied; V24 assumes those existing tables/functions.
6. Deploy the updated **public/** folder and **functions/** directory. Cloudflare Pages root remains the same as your previous deployment; do not paste Razorpay secrets into code.
7. Verify account and AI Studio no longer show the error, open Plans and verify the ₹699 subscription state, and complete webhook/payment sandbox tests before accepting live subscriptions.

## What changed in code
- Account / AI Studio bootstrap now gracefully handles the *specific* missing subscription table, without displaying PostgREST internals. It does not grant paid access from an absent table.
- A new subscription cannot be created unless both subscription and charge tables exist. This check happens **before** Razorpay API creates a customer mandate.
- Billing-page checks still surface a human-readable database-setup message (HTTP 503), rather than pretending live billing works.
- Navigation dots now use separate, non-shrinking text spans. The previous CSS used `display:block!important` exclusively on the third (Gallery) tab for narrow screens, overriding flex `gap`. V26 explicitly restores `display:inline-flex!important` for Gallery so its dot and label align like the other tabs.
- V26 service-worker cache revision updates styles/scripts. Existing account and gallery caching remains unchanged.

## Important
The ZIP cannot create tables in your hosted Supabase on its own. The SQL Editor step is mandatory. It does not require adding any new Cloudflare variables. Keep API Key Secret and Webhook Secret private, and rotate any exposed credentials before enabling live payments.
