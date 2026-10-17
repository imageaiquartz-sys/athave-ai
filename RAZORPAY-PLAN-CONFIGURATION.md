# Athave AI — configuration for the provided ₹699/month plan

## Public configuration received (LIVE mode)

- Razorpay Live Key ID (current): `rzp_live_Tn0Pk4Ja0vLjP9`
- Razorpay Live Plan ID: `plan_Tp05Bb5bcDRGgs`
- The plan must be verified in Razorpay as **INR ₹699.00**, **monthly**, interval **1**.
- This Plan ID is **not** an individual customer's subscription ID (`sub_...`). The backend creates those upon checkout.
- The project's checkout code is already wired to read this plan from the Cloudflare environment.

## Security warning

The merchant shared their Razorpay API Key Secret and webhook secret in a chat. **Rotate both before processing live payments. Razorpay API key rotation generates a new matching Key ID; replace that too.** Do not copy the disclosed values into any repository, ZIP, public HTML, JavaScript, `.env` committed to Git, or screenshots. This archive does not contain either value.

## Configure Cloudflare Pages → Workers & Pages → athave-ai → Settings → Variables and Secrets

| Name | Set to | Protection |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_Tn0Pk4Ja0vLjP9` **until** API key pair rotation, then the matching newly generated `rzp_live_...` Key ID | Plain text env variable |
| `RAZORPAY_KEY_SECRET` | The matching **newly rotated** Razorpay API Key Secret | **Encrypt** |
| `RAZORPAY_SUBSCRIPTION_PLAN_ID` | `plan_Tp05Bb5bcDRGgs` if created in the same Test/Live mode as the keys | Plain text env variable |
| `RAZORPAY_WEBHOOK_SECRET` | Your **newly rotated** webhook signing secret; the exact same secret must be entered in the Razorpay webhook setup | **Encrypt** |
| `PAYMENTS_ENABLED` | `false` until the SQL migration, webhook and test transaction work; then `true` | Plain text env variable |

Deploy again after saving the variables/secrets. Never mix Razorpay Test and Live credentials, plans, or webhooks.

## Configure Razorpay webhooks

- Webhook URL: `https://athave.in/api/webhooks/razorpay` **only if** `athave.in` is your actual deployed domain; otherwise substitute the deployed domain.
- Subscribe to the events named in `SETUP-RAZORPAY-699-SUBSCRIPTIONS.md` (especially `subscription.charged`), and set the **new** webhook signing secret to exactly the Cloudflare value.
- The backend verifies the webhook signature and uses subscription charges, not frontend callbacks, to grant or renew the 50-photo quota.

## Before going live

1. In Supabase SQL Editor execute `sql/V24-Razorpay-699-Subscription.sql` after prior required migrations.
2. Verify your Plan ID's amount (69900 paise), currency INR, frequency monthly and interval 1 using the Razorpay dashboard (or via the server once `RAZORPAY_KEY_ID` is available).
3. Test the subscription flow in Razorpay Test Mode with a **Test Mode plan and API pair**. If the supplied Plan ID is Live Mode, create a distinct ₹699/month Test Mode plan for testing.
4. Confirm successful signed `subscription.charged` webhook, renewal quota reset, duplicate webhook handling, payment-failure behavior, and customer cancel-at-period-end.
5. Only when tested, switch to Live Mode keys, Live Mode plan and Live Mode webhook together; set `PAYMENTS_ENABLED=true` and redeploy.

**Received:** current public live Key ID and live Plan ID. **Required before production:** rotate exposed live API Key Secret and webhook secret, update the live Key ID if a new API key pair is issued, run SQL migration, configure webhook and thoroughly test. No more private values should be shared in chat. See `LIVE-RAZORPAY-DEPLOY.md`.
