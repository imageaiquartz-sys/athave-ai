# Athave AI V16 — Manual photo service + separate AI Studio

## 1. Required deployment steps (do these in this order)

1. Run **`sql/v16_manual_upload_service.sql`** in the existing Supabase project SQL editor. It creates private manual-upload and output tables, payment records, a private `athave-manual` storage bucket, upload quota RPCs, and AI request protections. **Do not deploy the new frontend without running this migration.**
2. Deploy the entire `public/` directory as the Cloudflare Pages build output and the `functions/` directory as Cloudflare Pages Functions. Retain Cloudflare's existing secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `ADMIN_ACCESS_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `GEMINI_API_KEY`. Set `PAYMENTS_ENABLED=true` to offer live payments. Set `GENERATION_ENABLED=true` only if you also use old image generation endpoints; manual uploads work independently.
3. Keep the Razorpay **`payment.captured`** webhook configured as `https://athave.in/api/webhooks/razorpay`. New manual payments and legacy orders both use it. Confirm that Razorpay has enabled live payments before accepting customers.
4. Use `/admin/` to manage the upload queue. Secure it with a strong private `ADMIN_ACCESS_ID` **and Cloudflare Access/MFA**: its inherited admin ID-only endpoint is not suitable by itself for sensitive photo/order records. Do not post the ID publicly.
5. Test with Razorpay test mode, then validate a customer can buy a plan, upload JPG/PNG/WebP, view "Processing", and see/dowload multiple delivered files after admin upload. Confirm add-ons appear only when the paid upload allowance is exhausted.

## How plans work

- Customer starts a **₹499 / 30-day plan**, with **50 uploaded source images**. Each submitted original photo counts 1 upload, irrespective of how many output images an admin attaches to it.
- After using all 50, customer can buy **₹99 for +50 uploads** during the same 30-day plan. Every additional 50 uploads requires another ₹99 add-on.
- At the end of the period, add-ons and unused credits expire. Next manual ₹499 renewal starts a new 30-day plan with 50 uploads. **This is not an auto-debit subscription**; setting up Razorpay Subscriptions/autopay would require a separate mandate and recurring webhook workflow.
- Backend verifies the real captured payment with Razorpay and applies allowance via a transaction-safe Supabase RPC. UI counts are not trusted.
- Admin uploads are done manually. The website states **results expected within 24 hours**, but no scheduled worker currently enforces or guarantees that SLA.

## No-login order access

Customer browsers get a private HttpOnly signed device session, not a phone OTP. On first visit the app creates a **40-hex-character recovery code**, available from My uploads. Customers **must save this**: opening the service on another browser/device or deleting cookies otherwise creates a new empty workspace. The recovery code is a bearer credential; never share it or display it in public. This approach is less robust than a verified customer login for paid purchases. The optional name/contact input helps the admin identify users, but does **not** verify ownership of a phone number.

## AI Studio

The separate `/ai/` page supports text chat and up to three attached reference images. The "Generate image" mode calls the configured Gemini image model and stores outputs privately. Only active monthly plan customers can use it. Server-side fair-use limits default to **30 text requests/day and 10 image requests/day**, controlled by `MANUAL_AI_CHAT_MAX` and `MANUAL_AI_IMAGE_MAX`. AI access is not unlimited; monitor Google AI costs before changing these. Generated images may be inaccurate and should be checked before use. AI activity does not consume manual upload allowance.

## Safety and technical notes

- All uploads and results live in the **private** Supabase `athave-manual` bucket. They are served through endpoints that check customer session ownership or the admin session; no public storage URLs.
- Upload cap: JPG, PNG, WebP up to 8 MB per source photo; admin output up to 12 MB. Browser sends each original photo separately, so customers can upload at any time.
- Legacy OTP, credit-payment, and Gemini-generation APIs still exist in the server for migration compatibility, but the new customer interface no longer calls them. Do not remove their database tables if old paid orders and photos still need to be retained.
- New private tables have RLS enabled and no anon/authenticated access policies; only server-held Supabase service-role credentials are used.
- The site does not send email/WhatsApp notifications when work is delivered. Customers check My uploads to download results.
