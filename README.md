# Athave AI — complete Cloudflare Pages website (no Replit)

**Ready to upload to your EXISTING GitHub repository**. This version follows the provided white/minimal multi-page design. It preserves your existing Supabase database and MSG91 authentication flow. Generated product views, OTP delivery, and actual Razorpay transactions still need LIVE tests after deployment; the code has been syntax/integration tested locally with mocks, not with your real credentials.

## 1. Update GitHub

1. Extract the ZIP. **Upload the folder contents, not the ZIP file.**
2. In your existing GitHub `athave-ai` repository, on `main`, upload/replace `public/`, `functions/`, `sql/`, and the `README.md`.
3. Commit to `main`, keep your existing Cloudflare Pages integration.
4. Confirm **Cloudflare Pages → Deployments → Success**. Production build settings:
   - Framework: None
   - Build command: `exit 0`
   - Build output directory: `public`
   - Root directory: repository root (`/`)
5. Use your existing `https://athave-ai.pages.dev/` domain. The old OTP, data and payment configuration stay in Cloudflare and Supabase, not GitHub.

**Important:** The repository must have `functions/api/[[path]].js` at root and `public/index.html` in the `public` folder. If Github adds an extra enclosing folder, move its content up to the root.

## 2. Connect Google AI Studio FIRST

1. Open https://aistudio.google.com/api-keys using the Google account associated with the Gemini API billing project.
2. Create/copy an API key. Make sure that the project has API billing/positive credit balance and access to the selected image model.
3. In **Cloudflare → Workers & Pages → athave-ai → Settings → Variables and Secrets → Production** add:

| Name | Type | Value |
|---|---|---|
| `GEMINI_API_KEY` | **Secret** | Your Google AI Studio API key |
| `GEMINI_IMAGE_MODEL` | Text | `gemini-3.1-flash-lite-image` |
| `ANALYSIS_MODEL` | Text | `gemini-3.5-flash-lite` |
| `GENERATION_ENABLED` | Text | `false` (until live testing) |
| `AI_MONTHLY_CALL_CAP` | Text | `20` (low initial safety cap) |
| `MAX_GENERATIONS_PER_DAY` | Text | `5` (initial user safety cap) |

4. Save and redeploy your production Cloudflare Pages deployment to apply changes.
5. Sign into Athave AI with a real OTP, then open **`https://athave-ai.pages.dev/api/ai/check`** in the same browser. Expect `configured:true, accessible:true`. This checks key/model *metadata access only*; it cannot guarantee paid image generation will succeed. It does not create an image.
6. Start with **manual product type** if image analysis gives an error. This skips the additional product-detection model call and is usually cheaper.
7. Once all tests pass, set `GENERATION_ENABLED` to `true`, deploy configuration, and run **ONE real paid image test** with enough credits.

Google image-output pricing depends on the chosen model and may change: https://ai.google.dev/gemini-api/docs/pricing. A 1024px output is not automatically profitable simply because your user paid ₹499. You must count separate front/back image requests, any paid analysis, failed upstream calls, payment fees and tax. If the output has a complex pattern, WebP may not be very small.

## 3. Existing Supabase + MSG91 (DO NOT wipe data)

You've already run the initial SQL and fixed service-role table privileges. **Do not rerun SQL to reset your live database.** Reuse your current:

| Cloudflare variable | Type | Notes |
|---|---|---|
| `SUPABASE_URL` | Text | `https://PROJECT-ID.supabase.co` only (not `/rest/v1/`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Server-side only |
| `MSG91_WIDGET_ID` | Text | Your existing Widget ID |
| `MSG91_AUTH_KEY` | Secret | Your server-side MSG91 auth key |
| `SESSION_SECRET` | Secret | Your existing long random value **do not change casually**, it signs user sessions |

`MSG91_WIDGET_TOKEN` may remain stored but is **not used** in this backend's CAPTCHA-free server OTP flow. Keep actual SMS provider account limits and validation active. This project uses server-issued secure HttpOnly session cookies; no frontend API secrets.

Supabase Storage must have your **private `athave-results`** bucket. `sql/setup.sql` and `sql/otp_rate_limit_patch.sql` are reference/setup files for empty projects only. Your successful permissions patch should already be in effect.

## 4. Payments

The frontend offers:

- ₹499 Starter (30 image credits)
- ₹299 Top-up (18 image credits)
- ₹100–₹10,000 custom top-ups (`floor(amount * 30 / 500)` credits)

Payment order creation and captured-payment signature verification occur in the Cloudflare backend. A successful payment credits the wallet **only once** through Supabase RPC. Credits are deducted per requested output (front and back each cost one credit); failed jobs are refunded via the database function.

For test payments add Cloudflare secrets:

- `RAZORPAY_KEY_ID` (Text)
- `RAZORPAY_KEY_SECRET` (Secret)
- `RAZORPAY_WEBHOOK_SECRET` (Secret)

Configure Razorpay webhook URL: `https://athave-ai.pages.dev/api/webhooks/razorpay` for the `payment.captured` event. Use the exact same webhook signing secret in both Razorpay and Cloudflare. Verify test capture and top-up before enabling real payments. Do not switch Test→Live credentials without merchant approval.

## 5. Pages and behavior

- `/` – homepage, sample white polo + earbuds + white sneaker. No upload box. No Get Started header button.
- `/create/` – front photo required; back photo optional; optional manual product type; generate via Cloudflare API.
- `/results/` – separate downloadable outputs, each exported by the browser to white-backed 1024×1024 WebP, and "Download all as ZIP".
- `/profile/` – identity, image limit, progress, vertical links to history/payments/legal/personal website and developer.
- `/profile/history/`, `/profile/payments/` – account activity and downloads.
- `/about/`, `/terms/`, `/privacy/`, `/refunds/`, `/contact/`, `/how/` – standalone pages.

Header back arrow returns to the previous same-origin page or sensible fallback. While the login modal is open, mobile/browser **Back dismisses the modal first**. User sessions persist through navigation/reload via secure server cookies; the site re-fetches Supabase account state and won't turn a temporary server failure into forced OTP login.

For **a single garment front photo**, the AI attempts two separate front/back images; the unseen back is **inferred**, not guaranteed to match. For front+back photos, it uses both references. For shoes and other non-garments it normally makes one catalogue image. AI may alter tiny features, prints and logos; review outputs before listing them.

## 6. Before accepting actual customers

- Test real OTP → new account name → profile → reload → returning user login.
- Test manual polo generation and one pair of front/back garment photos with a safe, small monthly cap.
- Make sure `/api/ai/check` reports `accessible:true`.
- Test actual WebP downloads, same-origin session and private Supabase Storage.
- Test Razorpay sandbox payment capture and wallet credit exactly once.
- Add real customer service email, phone, merchant address and service response policy in `public/contact/index.html`. Current contact page deliberately contains no invented support address.
- Review/update all legal pages for your actual refund rules and applicable laws; these are drafts and not legal advice.
- Optionally edit founder personal site URL in `public/profile/index.html` and `public/about/index.html` if it changes.

## File structure

```
public/
  index.html                       Home
  create/index.html               Upload and Generate
  results/index.html              Results and WebP downloads
  profile/index.html              Account overview and links
  profile/history/index.html      Image history
  profile/payments/index.html     Payment history
  how/index.html                  How it works
  about/index.html                Founder and developer
  terms/index.html                Legal terms
  privacy/index.html              Privacy
  refunds/index.html              Refunds
  contact/index.html              Support contact
  styles.css                      Responsive white styling
  app.js                          Unified interactive client
  assets/                         Transparent logo, polo, earbuds, sneaker
functions/api/[[path]].js          Cloudflare Pages backend
sql/                               Existing schema and OTP safety SQL (reference)
README.md
```
