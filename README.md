# Athave AI — GitHub + Cloudflare Pages (NO REPLIT)

Athave AI is a mobile-friendly HTML/CSS/JS website with a Cloudflare Pages Functions backend, a private Supabase database, MSG91 OTP Widget phone login, Gemini image-editing, and verified Razorpay top-ups.

**Status:** complete deployable MVP source (not yet connected to your external accounts or end-to-end tested). Do not take real payments until all tests below pass. You do **not** need Replit, VS Code, or a paid Replit plan.

## 1. Create a GitHub repository in your browser

1. Download and extract `AthaveAI-Cloudflare.zip` to a folder on your PC (right-click ZIP → Extract All).
2. Sign in to [GitHub](https://github.com) using the GitHub account where you want to keep the project.
3. Create a new repository named `athave-ai`, preferably **Private**; leave it empty.
4. From the repository, choose **Add file → Upload files**.
5. Drag the **contents of the extracted folder** into GitHub: `public/`, `functions/`, `sql/`, `.gitignore`, and `README.md`.
6. Scroll down and choose **Commit changes**. **Do not upload a ZIP as one file**; the site needs the actual folders and files.
7. Do not commit your keys, private credentials, or `.dev.vars`.

## 2. Deploy Cloudflare Pages from GitHub

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** (labels may vary).
2. Authorize GitHub, then choose repository `athave-ai`.
3. Set:

   - Framework preset: **None**
   - Production branch: `main`
   - Build command: `exit 0`
   - Build output directory: `public`
   - Root directory: repository root (`/`)

4. Deploy. **Pages Functions in `/functions` deploy automatically from the Git-connected repository.** Do not choose Pages Direct Upload: it does not include Functions by default.
5. Initially the public website will show “setup pending,” since no external credentials have been added yet. This is expected.

## 3. Create Supabase database

1. Sign into [Supabase](https://supabase.com/dashboard) using your separate Supabase account.
2. Select your new **StudioWhite** project (you may keep this database project name; the actual site is branded **Athave AI**).
3. Go to **SQL Editor** → **New query**.
4. Open `sql/setup.sql`, copy **the entire file**, and run it once.
5. This sets up customer accounts, wallet, OTP token replay protection, payments, generations, transactional credits, and private `athave-results` storage bucket.
6. Check **Storage** → `athave-results` appears and is **Private**.
7. From project Overview/Settings obtain:
   - `SUPABASE_URL`: `https://YOUR-PROJECT-REF.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: backend secret **only** (Supabase legacy `service_role` key; if the project uses only new secret keys, adjust integration to use the supported server key). Never put in frontend JavaScript.

**Note:** We use a private custom-session authentication system after MSG91 server verification. Supabase Auth Phone OTP is *not* enabled/required, because we use the MSG91 Widget. All database access goes through the Cloudflare backend using the service role. The tables have RLS enabled and no public select/update policies.

## 4. MSG91 Widget (no separate DLT template in this particular Widget flow)

You already configured:

- OTP Widget ID: `366a6b694b72373637383033`
- Widget token: `StudioWhiteWeb` (retrieve the actual token value in MSG91 → OTP Widget/SDK → Tokens)
- Server Authkey: `StudioWhiteOTP` (retrieve actual Authkey in MSG91 → Settings → Authkey)

In MSG91, make sure Widget is **Enabled**, channel SMS works for Indian numbers, and the default MSG91 sender/template is authorized for this Widget product. Your account still needs whatever provider verification/subscription MSG91 requires.

The client uses `https://verify.msg91.com/otp-provider.js` with `exposeMethods: true`. The server verifies returned OTP access tokens at `https://control.msg91.com/api/v5/widget/verifyAccessToken` before authorizing the phone, and uses one-time token claims to block replay.

**Important:** MSG91 responses can differ by configuration. This integration deliberately **rejects a verification response that does not positively identify the verified mobile number**, even if the user entered a number. During your first real OTP test, if you see “MSG91 did not confirm the same mobile number,” we need to inspect the provider's documented response field and update the server parser. Do not bypass this check.

## 5. Add environment variables in Cloudflare

Cloudflare → **Workers & Pages** → your Pages project → **Settings → Variables and Secrets → Add**. Choose **Encrypt** for private keys and session secret. Add each key for **Production** (and separately for Preview if testing there). **Redeploy** after adding/changing values.

| Name | Where to get value | Secret? |
|---|---|---|
| `SUPABASE_URL` | Supabase Project URL | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase backend service key | **Yes** |
| `MSG91_WIDGET_ID` | `366a6b694b72373637383033` | No |
| `MSG91_WIDGET_TOKEN` | MSG91 `StudioWhiteWeb` token value | Widget client-readable |
| `MSG91_AUTH_KEY` | MSG91 `StudioWhiteOTP` Authkey value | **Yes** |
| `SESSION_SECRET` | Strong 32+ random characters | **Yes** |
| `GEMINI_API_KEY` | Your funded Google AI Studio key | **Yes** |
| `GEMINI_IMAGE_MODEL` | `gemini-nano-banana-2.1` | No |
| `ANALYSIS_MODEL` | `gemini-2.5-flash` | No |
| `RAZORPAY_KEY_ID` | Razorpay Test Key ID at first | Browser-readable |
| `RAZORPAY_KEY_SECRET` | Razorpay Test Key Secret | **Yes** |
| `RAZORPAY_WEBHOOK_SECRET` | A different random secret used in Razorpay webhook | **Yes** |
| `AI_MONTHLY_CALL_CAP` | `20` while testing | No |
| `MAX_GENERATIONS_PER_DAY` | `10` while testing | No |
| `GENERATION_ENABLED` | `false` until login and payments tested, then `true` | No |

`MSG91_WIDGET_TOKEN` is necessarily supplied to the client-side MSG91 SDK; **do not confuse it with `MSG91_AUTH_KEY`**. You can keep the four provider accounts signed into different email accounts. Their APIs do not require matching emails.

## 6. Razorpay top-up and webhook

- Start in **Razorpay Test Mode**. Set the Test Key ID and Secret in Cloudflare.
- Public pricing: **₹499 starter**, **₹299 top-up**, and custom top-up **₹100–₹10,000**.
- Internal credits (not advertised on public pricing): ₹499 → 30 images; ₹299 → 18 images; custom = `floor(amount × 30 / 500)` images. Each generated output (including front and back) uses 1 credit. **These are prepaid packs, not auto-renewing subscriptions.**
- Create a Razorpay webhook in Dashboard using the public Pages URL:

  `https://YOUR-SITE.pages.dev/api/webhooks/razorpay`

  Subscribe to `payment.captured` and use the same value you entered as `RAZORPAY_WEBHOOK_SECRET`.
- The backend verifies the webhook HMAC and fetches the gateway payment to ensure captured status, currency, amount and order ownership. Credits are granted by an idempotent SQL transaction.
- Only change Cloudflare variables to **Live** Razorpay keys after Test Mode passes and your merchant account/website is approved. Update the webhook to your real custom domain if you change domains.

## 7. Gemini image generation

The website accepts one or two uploads. Your browser resizes/optimizes them before upload to the API. Gemini first identifies product types with a lightweight analysis call, then creates:

- Shirt / polo / T-shirt / hoodie / jackets / dresses / pants / jeans / shorts / skirts / caps: **front + back** per recognized garment.
- A model wearing both shirt and pants: **four independent outputs** (shirt front/back + pants front/back).
- Shoe / bag / other object: **one clean professional catalogue image**.

The reference photos are sent to Gemini. Generated images are saved privately in Supabase Storage. The browser optimizes each output into **1024×1024 WebP**, tries to keep it around a few hundred KB without guaranteeing a fixed KB size, and sends the WebP to private storage for history. Users can download individual WebP files.

**AI accuracy limitation:** When a garment's back is unseen, the image is **AI inferred**, not an accurate reconstruction. Logos, print, sizing and exact colors cannot be guaranteed. The AI is prompted for solid white backgrounds, but tiny off-white areas may remain inside or near product edges. Review before publishing.

**Cost limitation:** One photo of a model wearing shirt+pants can cause **1 analysis request + 4 separately billed image generations**. Check your actual Gemini per-model pricing before making a profit promise. Failed API calls can sometimes still incur AI charges even when user credits are refunded.

Cloudflare Workers Free has strict CPU and memory limits; image generation can hit those limits. Since image conversion happens in the browser and images are optimized before upload, we've reduced backend CPU work, but **this is not guaranteed to stay within free-tier limits at scale**. To serve larger volumes, consider Cloudflare Workers Paid or a dedicated background job worker.

## 8. Test before accepting real customers

- [ ] Open your Cloudflare pages.dev URL and confirm brand logo, layout, favicon.
- [ ] Add ALL Supabase and MSG91 secrets; verify new Indian mobile number can receive OTP.
- [ ] Verify that after OTP it asks name once and creates a row in `customers` and `wallets`.
- [ ] Sign out, sign back in with same number: name prompt should not return.
- [ ] Check that a fake access token and another person's phone cannot log in.
- [ ] Complete a **Razorpay Test Mode** payment and verify credit adds **exactly once**, including a duplicate webhook.
- [ ] With a test wallet balance, turn on `GENERATION_ENABLED=true`, create one image and check successful WebP output and credit deduction.
- [ ] Test shirt+pants detection: 4 images, 4 credits used. Check each separately.
- [ ] Test failure (e.g. invalid Gemini model): reserved customer credit must be returned.
- [ ] Test login from a second browser, logout, history privacy, mobile browser download, quota behavior.
- [ ] Add Refund Policy, Privacy Policy, Terms, business support details before accepting live payments; this MVP needs legal/operational review.

## Development files

```
public/
  index.html           website
  styles.css           visual design
  app.js               browser UI, OTP SDK, image upload and WebP export
  assets/              unicorn logo + sample product images
functions/
  api/[[path]].js      Cloudflare backend (API + authentication + payments + Gemini)
sql/
  setup.sql            Supabase database + RPCs + private storage bucket
```

**No Replit required.** For the first deployment, make a GitHub commit from Chrome and connect it to Cloudflare Pages.
