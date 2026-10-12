# Athave AI V16 — customer uploads + admin delivery + AI chat

**Read `V16-SETUP.md` before deploying.**

Run `sql/v16_manual_upload_service.sql` in Supabase before replacing your Cloudflare Pages deployment. This is a new backend workflow and will **not** work by uploading only the HTML files. A valid Razorpay live/test configuration is needed for paid uploads, and `GEMINI_API_KEY` plus accessible models are needed for AI chat/image generation.

Main routes: `/` landing, `/create/` manual photo submissions, `/profile/` private uploads/downloads and recovery, `/topup/` ₹499 plan and ₹99 add-ons, `/ai/` separate Gemini AI studio, `/admin/` customer-card dashboard.

Pricing: ₹499 per rolling 30-day term with 50 original-photo submissions; ₹99 adds the next 50 submissions. Manual monthly renewal (no automatic card debit). Any source image may receive multiple results. Each submitted image is a separately countable upload, whether submitted alone or with others. Refunds and terms are in the public legal pages.

Security: Customers use a signed anonymous browser session plus an optional private recovery code, not OTP login. Admin authentication is separate and **must** be protected with Cloudflare Access/MFA in production. Existing legacy customer records and top-up balances are **not migrated** automatically. Live configuration and payments must be tested after deployment.
