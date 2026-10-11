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


## V7 admin redeem form hotfix
Fixed red error `Cannot read properties of null (reading 'reset')` after creating a redeem code. Only `public/admin.js` changed. The successful redeem code may already be saved in Supabase; refresh the admin page and inspect the list before creating another. No SQL, Cloudflare secret, or other deployment change is needed.


## V7 Gemini image-format API fix (October 2026)

The image-generation request previously sent `generationConfig.responseFormat.image.aspectRatio='1:1'`, which Google parsed as an enum and rejected with `Invalid value at generation_config.response_format.image.aspect_ratio`. The backend now uses `generationConfig.imageConfig` with string `aspectRatio: '1:1'` and `imageSize: '1K'`, as documented by the Google Gemini Generate Content API. This changes **only** `functions/api/[[path]].js`.

Upload the modified file to GitHub at the **exact same path** (the double brackets are part of the filename), commit to `main`, wait for Cloudflare Pages deployment success, and try one test image. Cloudflare secrets/SQL do not need updating. Images may incur Gemini charges. The generated original is returned by Gemini, with 1024x1024 WebP optimization in the customer browser on download.

Documentation: https://ai.google.dev/api/generate-content
