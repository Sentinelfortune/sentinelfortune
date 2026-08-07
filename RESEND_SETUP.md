# Resend Setup — Digital Shop

Resend sends the Shop's four transactional emails: order confirmation, secure download delivery,
replacement download link, and refund confirmation (`src/lib/email-templates.ts`). This is separate from
whatever email capability (if any) the rest of the repository uses — the audit found no existing email
sending integration to reuse.

## 1. Do not send real emails until this is fully configured

Until a real API key and a verified sending domain are set, leave `RESEND_API_KEY` unset in production.
`sendEmail` (`src/lib/resend.ts`) will simply fail and log the failure — order/license creation still
succeeds (fulfillment is not blocked on email delivery), but the customer won't receive their download
link automatically until this is fixed. For local testing, `.dev.vars.example`'s placeholder key is
enough to exercise the code path with mocked/failed sends; it will not actually deliver mail.

## 2. Create a Resend account and API key

1. Sign up at resend.com with the Owner's business email.
2. Dashboard → API Keys → Create API Key. Scope it to "Sending access" only.

```bash
cd shop-worker
npx wrangler secret put RESEND_API_KEY
# paste re_... when prompted
```

## 3. Verify a sending domain

Sending from an unverified domain is unreliable and often lands in spam. In the Resend dashboard:

1. Domains → Add Domain → enter the domain you want to send from (e.g. `sentinelfortune.com`, or a
   subdomain like `shop.sentinelfortune.com` to keep Shop mail separate from anything else).
2. Add the DNS records Resend gives you (SPF, DKIM, and optionally DMARC) at your DNS provider.
3. Wait for verification (usually minutes, can take longer depending on DNS propagation).

## 4. Set the from-address

Update `RESEND_FROM_EMAIL` in `shop-worker/wrangler.toml` (`[vars]` and `[env.production.vars]`) to an
address on the verified domain, e.g. `shop@sentinelfortune.com`. This does not need to be a real inbox —
it just needs to be on a domain you've verified with Resend. Customer replies to this address won't be
monitored unless you separately set up receiving; the Shop's contact page (`shop/contact.html`) points
customers at the Owner's actual support inbox instead.

## 5. Test delivery

After deploying with a real key and verified domain, run a full test purchase per
`STRIPE_SHOP_SETUP.md` §5 and confirm both emails (confirmation + download delivery) actually arrive,
render correctly (check both the HTML and plain-text versions), and that the download link in the email
works.

## 6. What each email contains

| Email | Trigger | Key contents |
|---|---|---|
| Order confirmation | `checkout.session.completed`, payment_status=paid | Order number, license number, amount |
| Download delivery | Same event, sent immediately after confirmation | Download link, expiry time, max download count, license number |
| Replacement link | Owner clicks "Generate Replacement Download Link" in `/admin` | New download link, new expiry/limit |
| Refund confirmation | `charge.refunded` | Order number, amount, notice that license/downloads are revoked |
