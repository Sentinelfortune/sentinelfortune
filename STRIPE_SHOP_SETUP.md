# Stripe Setup — Digital Shop

This Stripe configuration is **completely separate** from the existing tier-access system's Stripe usage
(`bot/services/stripe_webhook.py`, the `STRIPE_BUY_LINK_*` Payment Links). Do not reuse that webhook
endpoint, that webhook secret, or that secret key here — this Shop uses its own webhook endpoint and its
own signing secret so the two systems can never interfere with each other.

## 1. Use test mode first — no exceptions

Every step below should be done in Stripe's **Test mode** (toggle in the Stripe Dashboard) until a full
end-to-end test purchase and secure download have been verified (see `SHOP_RELEASE_CHECKLIST.md`) and the
Owner has explicitly approved switching to live mode.

## 2. Get your test-mode secret key

Dashboard → Developers → API keys → **Secret key** (starts with `sk_test_`).

```bash
cd shop-worker
npx wrangler secret put STRIPE_SECRET_KEY
# paste sk_test_... when prompted
```

For local development, put the same value in `.dev.vars` (copy from `.dev.vars.example`).

## 3. Create the webhook endpoint

Dashboard → Developers → Webhooks → **Add endpoint**:

- **Endpoint URL**: `https://<your-shop-worker>.workers.dev/shop/stripe/webhook`
- **Events to send**: at minimum, `checkout.session.completed` and `charge.refunded`
  (`src/routes/webhook.ts` only acts on these two event types today; any other event is logged and
  acknowledged with 200, but produces no order/license/refund action)

After creating it, click into the endpoint and copy its **Signing secret** (starts with `whsec_`):

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# paste whsec_... when prompted
```

## 4. Local webhook testing (optional but recommended)

```bash
stripe listen --forward-to localhost:8787/shop/stripe/webhook
```

This prints a local `whsec_...` — use it in `.dev.vars` for local testing, alongside `npm run dev`. Then:

```bash
stripe trigger checkout.session.completed
```

and confirm (via `wrangler d1 execute sentinel-fortune-shop --local --command "select * from orders"` or
similar) that an order/license/download authorization was created.

## 5. Test a real purchase end-to-end

1. Publish a test product with a real (small, e.g. $1.00) confirmed test-mode price via `/admin`.
2. Visit the product page on `/shop`, click Buy Now.
3. Complete checkout with a Stripe test card (`4242 4242 4242 4242`, any future expiry, any CVC).
4. Confirm you land on `success.html`, and that both a confirmation email and a download-delivery email
   arrive (see `RESEND_SETUP.md` — Resend must be configured first).
5. Click the download link in the email and confirm the file downloads.
6. In the Stripe Dashboard, issue a refund for that test payment and confirm a refund-confirmation email
   arrives and the download link stops working (`403`).

**Do not claim this system is production-ready until this exact sequence has been run and confirmed.**

## 6. Switching to live mode (Owner approval required)

Only after the above has been verified, and only with explicit Owner sign-off:

1. Repeat steps 2–3 in Stripe's **Live mode**, getting a new `sk_live_...` key and a new webhook endpoint
   + `whsec_...` for the production Worker environment.
2. `npx wrangler secret put STRIPE_SECRET_KEY --env production`
3. `npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production`
4. `npm run deploy:production`

Never put a live secret key in `.dev.vars`, in `wrangler.toml`, or in any committed file.
