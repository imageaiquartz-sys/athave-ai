# Athave AI V9 — SEO-optimized website + V8 generation features

This is a **complete GitHub + Cloudflare Pages project**, forked directly from V8. It retains your existing Supabase database, MSG91 OTP, selected-view generation, admin dashboard, Razorpay top-ups and redeem-code logic. **No new SQL** required beyond the V8 patch you have already run.

## Installation
1. Back up the current GitHub repository. Extract this ZIP and upload its **contents**, not the ZIP, to your existing `athave-ai` repository on the `main` branch, overwriting prior files. Cloudflare Pages deployment stays build command `exit 0`, output directory `public`, framework None.
2. Keep your configured production Cloudflare secrets intact. SEO does not need additional API keys.
3. When the deploy succeeds, confirm `https://athave-ai.pages.dev/robots.txt`, `https://athave-ai.pages.dev/sitemap.xml`, homepage and `/solutions/`. Check `https://athave-ai.pages.dev/admin/` separately, but do not submit it for indexing.
4. Open [Google Search Console](https://search.google.com/search-console/) and add a **URL-prefix property** for `https://athave-ai.pages.dev/` (or verify your real custom domain first). Use DNS or HTML tag verification as offered. Paste the provided Search Console meta verification tag into `public/index.html` if using tag method; Cloudflare redeploy is needed.
5. Submit `https://athave-ai.pages.dev/sitemap.xml` in Search Console → Sitemaps, then inspect the home page, `/solutions/` and `/about/`. Indexing is not immediate or guaranteed.
6. Use Google [Rich Results Test](https://search.google.com/test/rich-results) and [PageSpeed Insights](https://pagespeed.web.dev/) for further validation. 

## How this SEO package works
- Optimized unique titles/descriptions, Open Graph/Twitter cards, canonical links, local image preview and descriptive alt text. Includes a 1200×630 Open Graph social share image.
- **12 editorial public guides and business solution pages** with readable sections, buyer advice and real navigation. Avoid misleading claims: AI may infer hidden product details, and marketplace acceptance is never guaranteed.
- `Organization`, `WebSite` and `WebApplication` JSON-LD plus `founder` and `creator` entities for **Sabith Salah K P** and **Quartz Web Solutions**, with direct official links only where relevant. Founder remains off the customer Profile page.
- `robots.txt` and a sitemap of public URLs only; admin, private payment, account and results pages use noindex / are excluded.
- `SEO-STRATEGY/ATHAVE-1000-KEYWORD-MAP.csv` (and `.xlsx`) contain **1,000 candidate search phrases** grouped by target page and intent for future marketing—not a spam block to inject into HTML. Volumes and rankings are NOT independently verified.
- SEO content uses consistent `Athave AI` branding. Avoid keyword stuffing, doorway pages, duplicate descriptions and deceptive JSON-LD; Google ignores the meta-keywords tag.

## Canonical domain (important)
This package currently uses **https://athave-ai.pages.dev** because that is your established live domain. If you purchase and connect `athave.in` or another domain, **do not merely change links before DNS works**. Once it is live and verified, run `python tools/set_seo_domain.py https://YOUR-REAL-DOMAIN` to replace canonical links, Open Graph URLs and sitemap entries. Redirect the pages.dev hostname to the custom domain where possible, then verify the new Search Console property. DNS and registrar ownership are not established by this ZIP.

## Branded rankings
Optimized SEO does not make any site automatically #1 for `Athave`, `Athave AI`, `athave.in`, 1,000 keywords or other broad searches. Brand uniqueness, consistent mentions, real backlinks, indexed pages and time matter. Build truthful brand links from your verified channels and your developer Quartz Web Solutions website. Search Console impressions and queries should guide which content to expand.

## Trust and privacy
Keep admin auth separate from customer auth; an ID-only admin access code is **not sufficient** for public deployment with customer phone numbers or payment details. Put admin behind Cloudflare Access or stronger authentication. `robots.txt` and `noindex` are not security measures. Never publish your Gemini, MSG91, Supabase service-role or Razorpay secret keys.

## V8 feature reminder
The app **analyzes first** (vision API may cost a small amount) and creates only user-selected product views (one selected output = one image-generation request and one image credit). Existing SQL and configured APIs must remain operational. Your live platform should still be tested end-to-end.

### Prior project usage notes
# Athave AI V9 — SEO-optimized website + V8 generation features

This is a **complete GitHub + Cloudflare Pages project**, forked directly from V8. It retains your existing Supabase database, MSG91 OTP, selected-view generation, admin dashboard, Razorpay top-ups and redeem-code logic. **No new SQL** required beyond the V8 patch you have already run.

## Installation
1. Back up the current GitHub repository. Extract this ZIP and upload its **contents**, not the ZIP, to your existing `athave-ai` repository on the `main` branch, overwriting prior files. Cloudflare Pages deployment stays build command `exit 0`, output directory `public`, framework None.
2. Keep your configured production Cloudflare secrets intact. SEO does not need additional API keys.
3. When the deploy succeeds, confirm `https://athave-ai.pages.dev/robots.txt`, `https://athave-ai.pages.dev/sitemap.xml`, homepage and `/solutions/`. Check `https://athave-ai.pages.dev/admin/` separately, but do not submit it for indexing.
4. Open [Google Search Console](https://search.google.com/search-console/) and add a **URL-prefix property** for `https://athave-ai.pages.dev/` (or verify your real custom domain first). Use DNS or HTML tag verification as offered. Paste the provided Search Console meta verification tag into `public/index.html` if using tag method; Cloudflare redeploy is needed.
5. Submit `https://athave-ai.pages.dev/sitemap.xml` in Search Console → Sitemaps, then inspect the home page, `/solutions/` and `/about/`. Indexing is not immediate or guaranteed.
6. Use Google [Rich Results Test](https://search.google.com/test/rich-results) and [PageSpeed Insights](https://pagespeed.web.dev/) for further validation. 

## How this SEO package works
- Optimized unique titles/descriptions, Open Graph/Twitter cards, canonical links, local image preview and descriptive alt text. Includes a 1200×630 Open Graph social share image.
- **12 editorial public guides and business solution pages** with readable sections, buyer advice and real navigation. Avoid misleading claims: AI may infer hidden product details, and marketplace acceptance is never guaranteed.
- `Organization`, `WebSite` and `WebApplication` JSON-LD plus `founder` and `creator` entities for **Sabith Salah K P** and **Quartz Web Solutions**, with direct official links only where relevant. Founder remains off the customer Profile page.
- `robots.txt` and a sitemap of public URLs only; admin, private payment, account and results pages use noindex / are excluded.
- `SEO-STRATEGY/ATHAVE-1000-KEYWORD-MAP.csv` (and `.xlsx`) contain **1,000 candidate search phrases** grouped by target page and intent for future marketing—not a spam block to inject into HTML. Volumes and rankings are NOT independently verified.
- SEO content uses consistent `Athave AI` branding. Avoid keyword stuffing, doorway pages, duplicate descriptions and deceptive JSON-LD; Google ignores the meta-keywords tag.

## Canonical domain (important)
This package currently uses **https://athave-ai.pages.dev** because that is your established live domain. If you purchase and connect `athave.in` or another domain, **do not merely change links before DNS works**. Once it is live and verified, run `python tools/set_seo_domain.py https://YOUR-REAL-DOMAIN` to replace canonical links, Open Graph URLs and sitemap entries. Redirect the pages.dev hostname to the custom domain where possible, then verify the new Search Console property. DNS and registrar ownership are not established by this ZIP.

## Branded rankings
Optimized SEO does not make any site automatically #1 for `Athave`, `Athave AI`, `athave.in`, 1,000 keywords or other broad searches. Brand uniqueness, consistent mentions, real backlinks, indexed pages and time matter. Build truthful brand links from your verified channels and your developer Quartz Web Solutions website. Search Console impressions and queries should guide which content to expand.

## Trust and privacy
Keep admin auth separate from customer auth; an ID-only admin access code is **not sufficient** for public deployment with customer phone numbers or payment details. Put admin behind Cloudflare Access or stronger authentication. `robots.txt` and `noindex` are not security measures. Never publish your Gemini, MSG91, Supabase service-role or Razorpay secret keys.

## V8 feature reminder
The app **analyzes first** (vision API may cost a small amount) and creates only user-selected product views (one selected output = one image-generation request and one image credit). Existing SQL and configured APIs must remain operational. Your live platform should still be tested end-to-end.

### Prior project usage notes
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
