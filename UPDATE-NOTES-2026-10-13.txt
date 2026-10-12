# Athave AI V22 — Gallery, Admin Free Access & AI Studio Fit

## Deployment order (important)

1. **FIRST:** In your current Supabase project, open SQL Editor and run **`sql/V22-Admin-Free-Access-Gallery.sql`**. It creates the required grant, gallery view and free quota routines. It is additive: existing orders, membership rows and payment receipts are untouched. Do NOT re-run `sql/setup.sql` on an established database.
2. **THEN:** Deploy this full project to your existing Cloudflare Pages project (GitHub repository root, Pages build output directory `public`, same env vars as before). Keep the `functions/` directory at repo root.
3. Refresh the deployed site; its updated service worker will clear old static assets. The authenticated Gallery is at `/gallery/`.

## Grant / end complimentary access

1. User signs up / signs in using their verified phone OTP, and visits their workspace at least once.
2. Admin signs into `/admin/`, opens **Customers**, and finds the person by name or verified phone.
3. Click their customer card, then **Grant free access**. No Razorpay payment is required.
4. At any time, click **End free access** on that same detail panel. If the customer has a separately purchased active plan, that paid access remains usable.

Free access stays active until admin revokes it. To protect unexpected API costs it allows **up to 60 photo uploads / rolling 24h**, **30 AI chats / rolling 24h**, and **10 AI images / rolling 24h** per user (or lower Cloudflare-configured AI caps); there is also a site-wide free-AI-image safety cap of 100 / rolling 24h. Existing paid usage accounting is not touched by complimentary reservations.

## Gallery

- Customer-facing `Gallery` appears in top navigation and as a shortcut on Upload.
- Displays **admin-delivered finished images** only. AI-generated chat images are still retrievable in their existing chat thread, not the admin-delivery Gallery.
- Sorted newest to oldest with Load more (30 photos per page).
- Each photo offers a full preview and a Download link; server confirms the customer's verified session and checks their file ownership. Results are private in Supabase storage.

## Studio and other layout updates

- AI Studio uses a viewport-aware layout: the conversation region scrolls and the message composer plus Send button stay visible. Checked at 390×700, 390×844 and 1366×768.
- Logo and name are larger across the website; mobile navigation is kept on a second row to prevent overlap.
- The Upload page has less top whitespace and larger page heading.
- Gallery and AI Studio pages use matching luxury styling.

## Testing and limitations

Checked JavaScript syntax and browser layout in Chromium at the sizes above. Did **not** run live Supabase migrations, sign in to customer accounts, charge Razorpay, or make Gemini calls. To activate server features you must run the SQL migration before deployment.
