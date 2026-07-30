# Shop Known Limitations

Honest list of MVP tradeoffs. Each one was a deliberate scope decision to keep this the "smallest stable
end-to-end digital shop," not an oversight — but each is worth knowing about before scaling usage.

## Rate limiting is best-effort, not global

`src/lib/ratelimit.ts` is an in-memory, per-isolate fixed-window counter. Cloudflare Workers run many
concurrent isolates with no shared memory between them, so this limiter bounds abuse per warm isolate, not
across the whole edge network. **Fix:** add a Cloudflare Rate Limiting Rule on the zone for
`/shop/checkout` and `/shop/stripe/webhook` (dashboard-configured, not code) — see
`SHOP_SECURITY_CHECKLIST.md`. Keep the in-Worker layer too; it's a legitimate second line of defense, not
a replacement for the zone-level rule.

## Duplicating a product does not copy its images or files

`handleAdminDuplicateProduct` (`src/routes/admin/products.ts`) copies a product's text/pricing fields into
a new DRAFT but does not copy cover/preview images or downloadable files — those live in R2, not D1, and
copying R2 objects is a distinct operation this MVP doesn't implement. The Owner re-uploads assets for the
duplicate. Documented in `OWNER_SHOP_GUIDE.md`.

## Webhook crash-recovery is event-level, not transaction-level

If the Worker crashes partway through fulfilling a `checkout.session.completed` event (after recording
the Stripe event as received but before finishing order/license/download-authorization creation), the
event-level idempotency check (`recordStripeEventIfNew`) will treat a Stripe retry of that same event as a
duplicate and skip it — because the event row already exists — even though fulfillment never completed.
The business-object check (`getOrderBySessionId` before creating an order) closes this gap for the most
likely case (crash before any order exists), but a crash *between* order creation and license/download-
authorization creation is not automatically retried. **Mitigation today:** `/admin` → Orders lets the
Owner see an order with no license and manually investigate; **real fix** would be wrapping the whole
fulfillment sequence in a D1 transaction with a proper saga/outbox pattern, which was judged out of scope
for the MVP.

## One shared download budget across multiple files

When a product has more than one downloadable file, `GET /shop/download/:token` (no `file` param) returns
a JSON listing rather than streaming — the customer picks a file via `?file=<id>`. All files for that
order share the same `max_downloads` counter on the single `download_authorizations` row; there is no
per-file limit. For most products (one ZIP, or a small handful of files) this is the intended, simple
behavior; a product with many large files and a customer needing to re-download several times individually
could exhaust the shared limit faster than expected.

## No real database transactions across R2 + D1 writes

Image/file uploads write to R2 first, then D1. If the D1 write fails after a successful R2 write, an
orphaned R2 object can result (harmless — just unreferenced storage, not a security issue). There is no
scheduled cleanup job for orphaned R2 objects in this MVP.

## GitHub Pages cannot host the Cloudflare Access-protected admin app

Covered in depth in `SHOP_ARCHITECTURE.md`, but worth repeating here as a limitation, not just a design
note: `/admin`'s files exist in this repository for version control, but they must be deployed to a
separate Cloudflare Pages project to actually be protected by Access. Until that deployment step is done
by the Owner, the admin UI is not reachable by anyone through this repository's existing GitHub Pages
pipeline — which is the safe failure mode, but it does mean "the code is in the repo" is not the same as
"the admin app is live and protected."

## No customer accounts, coupons, subscriptions, or multi-currency

Explicitly out of scope per the mission brief: only one-time purchases, only USD, no discount codes, no
buyer login/dashboard (license lookup is via the emailed download link and license number, not a
password-protected account), and only `SINGLE_BUSINESS` licenses are purchasable through self-checkout
(the other three license types exist as prepared data but require a manual/negotiated sale — see
`shop/licenses.html` and `shop/contact.html`).

## License and policy text require legal review

`src/lib/license-text.ts` generates plain-language rights/restrictions summaries, and
`shop/terms-of-sale.html`, `shop/refund-policy.html`, and `shop/privacy.html` are good-faith drafts. None
of this is legal advice, and all of it is explicitly marked in-page as pending final review by qualified
counsel before the Owner relies on it in an actual dispute.

## Test suite covers logic, not a live Cloudflare/Stripe/Resend deployment

The 93 tests in `shop-worker/tests/` run against a real, in-memory SQLite database (seeded from the actual
migration SQL) and a fake in-memory R2 implementation, with `fetch` mocked for Stripe/Resend calls — this
proves the business logic is correct in isolation, using genuinely faithful test doubles, not that a real
deployment works. `SHOP_RELEASE_CHECKLIST.md` Phase 3 is the step that actually proves the deployed system
works, against real Cloudflare/Stripe/Resend infrastructure, and that step has not been run as part of
this branch — it requires real accounts/credentials this development environment does not have.

## Contact page has no backend form

`shop/contact.html` uses a `mailto:` link rather than a submission form posting to a new backend endpoint.
This was a deliberate choice to avoid adding a new unauthenticated write endpoint (a potential spam/abuse
vector) for a feature the mission didn't explicitly require as an API — email is fully functional as a
support channel without it.
