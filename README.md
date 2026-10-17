# Athave AI — V17 OTP + Paid Manual Photo Studio

**Read `V17-DEPLOY-AND-PAYMENTS.md` BEFORE deploying.** This version restores MSG91 phone OTP login, links manual uploads and results to verified customer accounts, adds a payment-history profile page and an admin-editable homepage image. It includes the new SQL patch `sql/v17_otp_accounts_permissions_and_hero.sql` to repair Supabase's `manual_customers` 403 permissions error.

Routes: `/` homepage, `/create/` product photo uploads, `/profile/` verified profile, `/profile/payments/` account payment history, `/topup/` 30-day plans & add-ons, `/ai/` optional AI assistant, and `/admin/` admin delivery queue + homepage image controls.

Pricing: ₹499 per 30-day **prepaid** membership with 50 original source image uploads; ₹99 adds 50 more uploads during an active period. **Automatic renewal is not yet implemented.** Razorpay and Supabase live integration require configuration and testing before production use.

## Razorpay recurring subscription (V24)

The public site now offers only the ₹699/month subscription. Follow **SETUP-RAZORPAY-699-SUBSCRIPTIONS.md**, including the new SQL migration and Cloudflare secret setup, before enabling payments. Older `PAYMENTS-AND-PWA-SETUP.md` describes the deprecated one-time payment plan; do not follow it for new sales.

## Razorpay plan configuration
- `RAZORPAY-PLAN-CONFIGURATION.md` — Cloudflare setup for your supplied Razorpay plan ID (no secrets included).

### Live ₹699 subscription deployment

See **`LIVE-RAZORPAY-DEPLOY.md`** for the current Live public Key ID, subscription Plan ID, secret-rotation warning, Supabase SQL migration, and webhook checklist. Private credentials are not packaged.
