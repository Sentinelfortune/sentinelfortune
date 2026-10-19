# PUBLIC EXPERIENCE V2 — ACTIVATION PLAN

Nothing in this mission was deployed. This is what stands between the branch
and the public, in order.

---

## 0. The decision that comes first

V2 upgraded `platform/`, the canonical shared platform §3 designates. The URL
§2 names — `sentinelfortune.github.io/sentinelfortune/` — is served by the
**root Jekyll site**, a different implementation, and `platform/` has **zero
files on `origin/main`**.

So before anything else:

> **Which implementation is the public experience?**

| Option | What it means |
|---|---|
| **A. Platform becomes the public experience** | deploy `platform/` to a host and point the public URL at it. The Jekyll site stays as the institutional//shop surface |
| **B. Platform stays a parallel preview** | V2 is validated but not public; the Jekyll homepage continues to serve |
| **C. Port V2 into Jekyll** | re-implements the engine in Liquid — creates the second implementation §3 forbids. **Not recommended** |

Everything below assumes **A**.

## 1. Before public activation

| # | Item | Owner / engineering | Blocking? |
|---|---|---|---|
| 1 | **Real imagery** — ATTENTION / VALUE / DISCOVERY per release | **Owner content** | **Yes** — the page reads abstract without it |
| 2 | Decide which worlds are `hubVisible` | **Owner** | **Yes** — today zero boards link publicly |
| 3 | Deploy target for `platform/` | engineering | Yes |
| 4 | Point the public URL at it | **Owner** | Yes |
| 5 | Replace TEST_PREVIEW feed with a LIVE one | House of Assets | Yes — the preview banner shows until `evidence: "LIVE"` |
| 6 | Verify support infrastructure, or leave support inert | **Owner** | No — inert is a safe, honest state |
| 7 | Subdomain DNS, if any world goes `subdomainLive` | **Owner** | No |
| 8 | Analytics, per the measurement contract | engineering | No |

## 2. Raising a world onto the homepage

The flags are strictly nested — `subdomainLive ⟹ hubVisible ⟹ experienceReady`
— and a flag raised out of order is **ignored**, not obeyed.

1. The world passes its gates → `experienceReady: true` (today: Academy only).
2. The Owner chooses to surface it → `hubVisible: true`. The board becomes a
   link to `/i/<slug>/` on the platform.
3. The subdomain actually serves → `subdomainLive: true`. The board links to
   `https://<slug>.sentinelfortune.com/`.

Set these in **`_data/identities.yml`** — the institutional site is the source
of truth — and mirror them in `platform/engine/identities.js`. The drift test
fails the build if they disagree, so they cannot silently diverge.

## 3. Turning support on

Support renders a payment action **only** when the page is given:

```js
window.SF_SUPPORT = { enabled: true, href: "https://<verified-destination>" };
```

No default exists anywhere in the module, and the destination must be `https://`.
Until then the amounts are inert and the page says support is not open.

## 4. Explicitly not done

No deployment. No DNS. No Cloudflare, Vercel, R2, Stripe or Shop change. No
merge to `main`. The root Jekyll site, `apps/floor/`, the corridor and the
transport are untouched. No production content was published.

## 5. The next Owner decision

1. **A, B or C** in §0.
2. **Which worlds, if any, become `hubVisible`.**
3. **Who supplies the three images per release**, and when.
