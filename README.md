# Athave AI V7 — GitHub / Cloudflare Pages

This is the COMPLETE website package (not just a patch). Upload **contents of this folder** to GitHub repository root. Keep `public/`, `functions/`, `sql/`.

## Cloudflare Pages
- Framework: None
- Build command: `exit 0`
- Output directory: `public`
- Root: repository root

## Existing environment variables
Keep SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MSG91_WIDGET_ID, MSG91_AUTH_KEY, MSG91_WIDGET_TOKEN, SESSION_SECRET, GEMINI_API_KEY, GEMINI_IMAGE_MODEL, ANALYSIS_MODEL, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.

## Separate admin
- Open `/admin/` directly. Login needs **only admin ID**, not customer mobile OTP.
- In Cloudflare Production Variables and Secrets, set `ADMIN_ACCESS_ID` to `Tefter` (Secret). Existing `SESSION_SECRET` signs a separate 8-hour admin cookie.
- Normal customers use OTP from `/` and `/profile/`. Admin uses `/admin/` and its own independent cookie. Customer session cannot unlock `/admin/`.
- Admin can read customers, verified top-ups, create and disable redeem codes.
- Existing V4 SQL migration must already be installed for admin APIs. **No new SQL changes** for V7.

### SECURITY WARNING (IMPORTANT)
The publicly chosen admin ID `Tefter` is a **weak credential**. Anyone who guesses or knows the ID could access customer phone numbers and payment records. Before real production/customer use, use a strong unique private secret as ADMIN_ACCESS_ID and preferably protect `/admin/` with Cloudflare Access / passkeys / 2FA. An ID-only admin login is not suitable protection for financial or personal data. Do not put the ID into frontend code or GitHub. Cloudflare WAF rate limiting on `/api/admin/login` is recommended.

## Homepage
Uses the two supplied transparent-background images: white polo and white earbuds; no shoe, no combined eraser mask or forced image blending.

## Studio
A simple single-line image balance / Top up link, with modest spacing before Generate. Upload requires a product photo; a second reference is optional.

## Production checks
- Test mobile OTP login -> account/profile -> generation.
- Test `/admin/` ID login in a private browser with NO customer session; only the admin cookie should unlock its endpoints.
- Verify failing login cannot read `/api/admin/users`. Verify customer OTP cannot read admin endpoints.
- Verify redeem codes and Razorpay orders in Test Mode before enabling real payments.
- Gemini image generation uses backend API and must be configured separately. Keep GENERATION_ENABLED=false until tested.
