# Athave AI V8 — Selective, low-waste image generation

This is a **full replacement website**, with the current Cloudflare Pages Functions backend, Supabase customer/payment/redeem integration, MSG91 OTP login, one-time top-ups, admin dashboard and the new two-step product workflow.

## Install (existing Athave AI project)

1. **Before deploying code**, open the SAME Supabase StudioWhite project already used by Athave AI.
2. Supabase → SQL Editor → New query → paste `sql/v8_analysis_cache_limits.sql` → Run. Only run the V8 patch on existing accounts. It creates an `analysis_requests` cache and rate limiter; it does not reset customer, wallet, payment, job or redeem data.
3. Extract this ZIP; **upload its contents** into the root of your EXISTING GitHub `athave-ai` repository and replace the old files. Keep folder nesting intact: `public/index.html`, `public/create/index.html`, `public/app.js`, `functions/api/[[path]].js`.
4. Commit to `main`; wait for Cloudflare Pages to deploy. Existing Cloudflare Pages settings remain: framework **None**, build command `exit 0`, output `public`, repository root blank.
5. Keep all existing Production secrets in Cloudflare (Supabase URL, service role key, SESSION_SECRET, MSG91, Razorpay, Gemini, ADMIN_ACCESS_ID, GENERATION_ENABLED).
6. Optionally add `MAX_ANALYSES_PER_DAY=12` as **Text** in Cloudflare production variables. Default is 12. You can change `ANALYSIS_MODEL` to `gemini-3.5-flash-lite` if your Gemini API project has access; do not change a model that is already working merely to follow the example. See https://ai.google.dev/gemini-api/docs/models for supported model IDs.
7. Refresh your site; sign in with phone OTP at `/create/`. Upload one or two photos, press **Analyze my products**, tap the view cards you need and then press **Generate N selected images**. Open `/results/` for 1024 × 1024 optimized WebP downloads.

## Exactly how the credit and API costs work

- The **Analyze** action calls a vision/text model to detect up to 4 products but **never generates images or deducts customer image credits**. Google may bill a small amount for that analysis API call.
- Same uploaded photos are recognized by hash and reused from the database cache without another analysis model request. New analysis attempts are limited to 12/day per user by default, with a 20-second minimum gap for new photos.
- User sees small **clickable view cards**, not checkboxes. No output is selected automatically. The website shows the exact number of image credits needed.
- Only selected view cards trigger image model calls. **One selected view = one request = one customer image credit**. For example a model wearing a polo and trousers can yield four card options; selecting only Polo Front runs exactly one image generation request.
- An image credit is reserved at the start of each generation and refunded on backend failure; Google can still charge for unsuccessful Gemini requests. The app stops batch generation at the first failed output to limit runaway charges.
- Outputs are private in Supabase Storage; images are converted to centered, white-background 1024×1024 WebP on download and compressed as far as quality permits. The model is *asked* to produce pure white but pixel-perfect fidelity for unseen backs and tiny logos cannot be guaranteed.

## Supported detections and view cards

Clothes (T-shirt, polo, shirt, trousers, shorts, jeans, skirt, hoodie, jacket, dress): **Front, Back**.
Shoe: **Catalogue, Side, Back**. Watch: **Front, Angled**. Bag: **Front, Back, Side**. Cap: **Front, Back**. Other: **Catalogue, Angled**.

## Profiles, payments and admin

- The separate customer profile no longer contains the founder's personal-site link. Information about the founder remains in About.
- Existing ₹499, ₹999, custom Razorpay top-ups and customer redeem-credit system are retained.
- Separate `/admin/` still uses the existing `ADMIN_ACCESS_ID` unlock mechanism. An ID-only admin credential is **not secure enough for public launch**; protect admin with Cloudflare Access or another real second factor before storing customers' sensitive information or accepting live payments.

## Optional improvement for lower provider costs

Image processing (simple background cutout plus canvas) may cost less than generative AI for clean product photos, but that requires a separate segmentation service or model runtime. This package intentionally does **not** silently send images to a third-party service or claim it performs a cheaper operation without that provider being configured. The real savings here come from lower-cost vision detection and generating *only selected outputs*.
