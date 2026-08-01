> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# Cloudflare Access Map

## Status: NOT VERIFIED

No Cloudflare Access API tool is exposed to this environment, and all HTTP is blocked, so no Access
application, policy, identity provider, audience tag or service token could be enumerated or confirmed.

## What is known from source and prior Owner statements

| Item | Value | Source | Status |
|---|---|---|---|
| Team domain | `sentinelfortunellc.cloudflareaccess.com` | `wrangler.toml` `[env.test.vars]` | Config VERIFIED; live Access app NOT VERIFIED |
| AUD tag | Uploaded as the `CF_ACCESS_AUD` secret | Owner-stated | **NOT VERIFIED** — value never read, correctly |
| Protected hostname | `sentinel-fortune-shop-admin.pages.dev` | Owner-stated | **NOT VERIFIED** |
| Policy names / IdP | — | — | **NOT VERIFIED** |
| Service tokens | — | — | **NOT VERIFIED** |

## Enforcement design (verified in source, not in production)

Two independent layers:

1. **Edge** — Access protects the admin Pages hostname (NOT VERIFIED live).
2. **Worker** — every `/shop/admin/*` request is re-verified in `src/lib/auth.ts`: RS256 signature
   against the team JWKS, audience, expiry, and (only on the branch, **not deployed**) issuer.

Fail-closed: missing/empty/placeholder team domain or AUD ⇒ 401 on every admin route.

## app.sentinelfortune.com vs Shop Admin

**NOT VERIFIED whether they are protected independently, share an Access application, or whether
`app.sentinelfortune.com` is behind Access at all.** No shared infrastructure was demonstrated. Do not
assume either way.
