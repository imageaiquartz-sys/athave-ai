# Athave AI — athave.in live-domain SEO setup (2026-10-12)

**Chosen canonical hostname:** `https://athave.in` (without `www`).

## Changes in V10
- All 25 HTML pages have `https://athave.in` for canonical, Open Graph, Twitter and structured-data URLs (where applicable).
- `robots.txt` sitemap directive and all 20 `sitemap.xml` URLs use `https://athave.in`.
- Removed redundant Open Graph/Twitter `<meta>` tags on older pages.
- Preserved 1,000 search-keyword planning workbook and 12 informational SEO guides from V9.
- Kept founder **Sabith Salah K P** and developer **Quartz Web Solutions** on relevant public pages and JSON-LD. Did not restore the founder personal link to customer Profile.
- Removed `offers` from site WebApplication structured data until live paid top-ups are ready; the payment system code and displayed prices were not touched.

## Deploy
1. Upload the contents of this ZIP (not the ZIP itself) to the existing `athave-ai` GitHub repo on `main`. Cloudflare Pages uses `public` as the output directory, no build command needed unless your repo already uses one.
2. Confirm HTTPS works on `https://athave.in/`, `https://athave.in/robots.txt`, `https://athave.in/sitemap.xml` and `https://athave.in/solutions/`.
3. In Google Search Console add/verify the **athave.in Domain property** (DNS TXT verification), then submit `https://athave.in/sitemap.xml`. A Domain property covers www, non-www and subdomains. Submit the apex HTTPS homepage in URL Inspection for re-crawl.
4. Make sure `https://www.athave.in` permanently redirects to `https://athave.in` if www is configured.
5. Cloudflare's official guidance for old `*.pages.dev` hostname: create a **Bulk Redirect** with Source URL `athave-ai.pages.dev`, Target `https://athave.in`, Status `301`, **Preserve query string**, **Subpath matching**, **Preserve path suffix**, and **Include subdomains**. This setting lives in Cloudflare dashboard and **cannot be applied automatically by uploading the GitHub ZIP**. See https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/ . Do NOT put `/* https://athave.in/:splat 301` in a Pages `_redirects` file; that would also affect the custom domain.
6. Confirm after deployment that `https://athave-ai.pages.dev/solutions/` redirects to `https://athave.in/solutions/`, and there are no redirect loops.
7. Check Cloudflare project -> Custom domains -> `athave.in` = Active. Domain resolvability could not be independently confirmed from the build environment.

## Payments not active yet
- The SEO update is independent of Razorpay activation and does not turn payments on. Do not claim checkout is available until you have tested a real checkout in production.
- After launch update approved Razorpay website URL, callback/webhook allowed origins (as applicable) and MSG91 allowed domain for `https://athave.in`; user sessions on the old `pages.dev` cookie domain will not automatically transfer.
- Secure the `Tefter`-only admin page before accepting real payments or exposing customer records publicly; a shared ID alone is insufficient.

## Measuring ranking (not guaranteed)
- For brand terms (`Athave`, `Athave AI`, `athave.in`) track impressions and branded queries in Search Console. For generic buyer searches (product background remover, e-commerce image maker, white-background catalogue photos) use the associated guide page.
- Maintain useful content and avoid publishing 1,000 thin pages or a stuffed meta-keywords tag.
