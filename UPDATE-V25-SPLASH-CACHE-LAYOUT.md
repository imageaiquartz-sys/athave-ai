# V25 – White splash, incremental gallery/upload caching, navigation spacing and Studio footer

- Startup screen shows the Athave logo directly on pure white without dark or rounded cards. This is the **website** splash; Android/iOS **native installed-PWA** splash may require reinstalling the app after a deployment. PWA manifest background and icons are already white.
- Authenticated workspace: verify the signed HttpOnly session with the server before using locally cached account details. No credentials, OTPs or tokens are stored in browser caches. Cached customer data is only restored when account IDs match.
- Workspace and subscription status are rechecked on an interval and on visibility return; backend validates access and payments for every protected action.
- Upload lists: render saved rows after verified login; request a tiny latest-update/count version first; if unchanged avoid retrieving the entire list. If changed, merge changed upload records or fall back to a full refresh when necessary. Upload submissions force refresh.
- Gallery: render saved list, verify lightweight newest-delivery/count, merge newly delivered metadata where possible; handle deletion/complex changes with a fresh first-page request. Private image previews are cached per user (up to 50), and caches are deleted on sign-out.
- Private APIs and payment/auth responses remain `no-store`; the service worker caches public static assets only.
- All four header nav tabs have equal spacing between the dot and text, including Gallery on mobile.
- AI Studio disclaimer has visible bottom/safe-area spacing without overflowing the studio viewport.

No Supabase migration required for V25. No payment, subscription-price, credit limit or administrative workflows changed.

## Deployment
Upload the entire project to GitHub/Cloudflare Pages as before; confirm Pages Functions and `/api/` endpoints remain active. Use a hard reload or reopen the PWA for the new UI, and reinstall the installed PWA if the operating system retains an old native startup image.
