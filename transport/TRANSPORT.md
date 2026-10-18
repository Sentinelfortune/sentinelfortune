# SFL EDITORIAL API — LIVE TRANSPORT, PHASE 1

The authenticated transport in front of the already-verified SFL Editorial
Corridor.

```
OWNER
  ↓
ChatGPT / Claude
  ↓
ONE AUTHENTICATED EDITORIAL API        ← this directory
  ↓
ONE SFL EDITORIAL CORRIDOR             ← corridor/  (unchanged)
  ↓
ONE PUBLIC ENGINE                      ← platform/engine/  (unchanged)
  ↓
ONE CORE → ONE COMMERCIAL HEART → ONE IDENTITY ROUTER
  ↓
SEVEN SPECIALIZED BRANCHES
```

---

## 1. What this is, and what it is not

**It is** transport and authorization: parse, authenticate, route, serialize.

**It is not** editorial logic. It does not validate a record, choose a branch,
resolve an intent, decide a state transition, check an approval or build a
feed. Every one of those already exists in the corridor and is **called**,
never reimplemented. A test asserts this structurally: the transport is
scanned for any redefinition of the corridor's governing vocabulary
(`BRANCHES`, `CONTENT_TYPES`, `PRESENTATION`, `TRANSITIONS`, `validate`,
`normalize`, `canPublish`, `isPublic`, `resolveIntent`, `toPublicRecord`,
`buildFeed`, `pricingTier`) and must contain none.

The corridor was **not redesigned and not modified** for this phase. No
transport-blocking defect was found in it.

---

## 2. Files

| File | Lines | What it is |
| --- | --- | --- |
| `core/http.js` | 347 | the one request handler — runtime-agnostic |
| `core/auth.js` | 201 | three principals, digest verification, optional signing |
| `core/project.js` | 139 | what goes back over the wire (serialization only) |
| `core/errors.js` | 109 | one error shape, status mapping, pre/post-auth detail rule |
| `runtime/worker.js` | 70 | Cloudflare Worker shim |
| `runtime/node.mjs` | 86 | Node shim, for the live proof and local use |
| `runtime/store-kv.js` | 77 | KV persistence through the corridor's snapshot seam |
| `scripts/mint-credential.mjs` | 103 | generate a token + its digest, locally, once |
| `scripts/deploy-test-preview.sh` | 178 | the whole Owner-side activation, one command |
| `scripts/validate-remote.mjs` | 522 | 69 checks against the deployed Worker |
| `scripts/make-connector.mjs` | 136 | build the two client packages from the real URL |
| `PHASE2-ACTIVATION.md` | 225 | the activation runbook and its evidence |
| `contracts/openapi.json` | 219 | the ChatGPT connector contract |
| `contracts/claude-tools.json` | 177 | the Claude tool contract |
| `wrangler.toml` | 103 | Worker config — contains no secret |
| `tests/transport.test.mjs` | 657 | 29 transport tests |
| `e2e/live.mjs` | 335 | 64-check proof over real HTTP on a real socket |

2,899 lines in all, zero dependencies.

---

## 3. Deployment target: Cloudflare Workers

**Chosen because it is an existing Sentinel Fortune deployment path, not a new
one.** The repository already deploys Workers (`shop-worker/wrangler.toml`,
`cloudflare/api-worker.js`) and the Cloudflare account already runs 68 of them.

| Why Workers | |
| --- | --- |
| Already in use | conventions, tooling and Owner familiarity all exist |
| No build step | the corridor's zero-dependency ES modules run unchanged |
| Secrets | `wrangler secret put` — Worker secret storage, nowhere near the repo |
| Persistence | KV / D1 / Durable Objects already available for the corridor's seam |
| Isolation | a Worker of its own, sharing no binding with the shop or ecosystem Workers |

**Why not Vercel.** The Vercel project serves the seven public hostnames and
holds no credentials. This API holds three. Putting a credentialed write
surface inside the project that serves the public site widens that project's
blast radius for no benefit. The two stay separate.

**Why not Git-backed.** Settled in `corridor/CONTRACT.md` §22: a Git-backed
transport cannot satisfy "no unrestricted Git authority" without becoming an
authenticated API anyway.

The Worker name `sfl-editorial-api` was checked against the account's 68
existing Workers and is free — no collision.

---

## 4. API surface — one endpoint for clients, separate routes for the Owner

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/health` | none | up? which mode? |
| `GET` | `/v1/contract` | none | actions, intents, rules, error schema |
| `POST` | `/v1/editorial` | **CLIENT** | the one normalized action endpoint |
| `POST` | `/v1/owner/approve` | **OWNER** | approve a record + version for publication |
| `POST` | `/v1/owner/withdrawal` | **OWNER** | authorize an unpublish or archive |
| `POST` | `/v1/owner/reject` | **OWNER** | reject |
| `POST` | `/v1/owner/rollback` | **OWNER** | restore an earlier version |
| `GET` | `/v1/owner/approvals` \| `/feed` \| `/audit` \| `/records` | **OWNER** | read state |

One endpoint carries all eight client actions, selected by the `operation` /
`intent` field the corridor adapters already read. There is **one API**, not
seven, and not one per action.

`/v1/health` deliberately does not disclose which principals exist.

---

## 5. Authentication model

**Three principals, three credentials, no sharing.**

```
CLIENT_CHATGPT   the eight editorial actions
CLIENT_CLAUDE    the same eight, and only those
OWNER            approve / authorizeWithdrawal / reject / rollback
```

**The credential chooses the adapter.** There is no `provider` field in any
request body. A ChatGPT token always runs `fromChatGPT`; a Claude token always
runs `fromClaude`. A caller cannot state which identity it is acting as, so it
cannot lie about it. A test sends a Claude-shaped body with a ChatGPT token and
confirms it is refused rather than quietly accepted as Claude.

**No secret is in this repository, and none is in the process.** The
environment supplies the **SHA-256 digest** of each token, never the token:

```
SFL_CORRIDOR_CHATGPT_TOKEN_SHA256    64 hex characters
SFL_CORRIDOR_CLAUDE_TOKEN_SHA256     64 hex characters
SFL_CORRIDOR_OWNER_TOKEN_SHA256      64 hex characters
```

A digest cannot be replayed as a credential, so a full dump of the Worker's
configuration grants nothing. The presented bearer is hashed with WebCrypto and
compared in **constant time**. Every configured digest is compared even after a
match, so timing does not reveal which principal matched or how many exist.

A principal with no digest configured **does not exist** — it is not
"disabled", it has no credential that can match. A fresh deployment therefore
grants nothing until the Owner deliberately sets a digest. A malformed digest
disables that principal and is logged rather than being treated as a
near-match.

**Revocation, two ways:**
- instant, no rotation: `SFL_CORRIDOR_REVOKED="CLIENT_CHATGPT"` → 403 before
  anything is evaluated;
- permanent: rotate the digest. Revoking one principal provably does not affect
  the others.

**Optional request signing.** When `SFL_CORRIDOR_SIGNING_SECRET` is set, every
request must also carry `X-SFL-Timestamp` and `X-SFL-Signature`
(HMAC-SHA256 over `<timestamp>.<METHOD>.<path>.<sha256(body)>`). A timestamp is
only ever honoured as part of a signature — a timestamp header alone would be
security theatre, since anyone who can replay a request can edit a header. With
no signing secret configured this layer is **absent and says so**, rather than
pretending.

**What actually protects against replay, always:** the corridor's
instruction-id ledger. A replayed command returns the original outcome and
writes nothing. The transport additionally refuses an `Idempotency-Key` header
that disagrees with the instruction id in the body — two different notions of
"the same request" is how a duplicate publication eventually happens.

---

## 6. Error contract

```json
{ "ok": false,
  "error": { "code": "BRANCH_REJECTS_TYPE", "step": "IDENTITY_VALIDATION",
             "message": "VibraFlow Media does not publish TUTORIAL — it covers …",
             "retryable": false } }
```

`step` names which of the corridor's nine pipeline steps refused, so "why did
this not publish" always has a precise answer.

**Detail is withheld until the caller has proved who it is.** Before
authentication every refusal is the same string, `"Request refused."`, with the
real reason going to the log only — an unauthenticated caller learns nothing
about what exists. After authentication the corridor's own reason is returned
verbatim, because those refusals are written to teach a client what to change.

Only `RATE_LIMITED`, `INTERNAL` and `NOT_CONFIGURED` are marked `retryable`.

---

## 7. Publication authority — two independent locks

1. **The corridor's Owner gate, unconditional.** `publish_approved` requires an
   approval naming the record, the version and the action. It is minted only
   through the Owner's credential, appears in **no request shape either adapter
   accepts**, goes stale if the text changes after approval
   (`APPROVAL_STALE`), and is spent on use.

2. **The deployment mode lock.** `SFL_CORRIDOR_MODE=TEST_PREVIEW` refuses
   `publish_approved` **at the edge**, before the corridor is reached, even
   when a valid approval exists. `TEST_PREVIEW` is the **default**, so a
   deployment that forgets to set a mode cannot publish.

`LIVE` mode removes only lock 2. It does not relax lock 1 in any way, and a
test proves publication is still refused with `OWNER_APPROVAL_REQUIRED` in
`LIVE` mode without an approval.

---

## 8. Deploying it (Owner-side)

```bash
# 1. the KV namespace for the corridor's snapshot seam
wrangler kv namespace create SFL_EDITORIAL
#    → paste the returned id into transport/wrangler.toml

# 2. mint the three credentials, one at a time.
#    The TOKEN goes to the client; the DIGEST goes to the Worker.
node transport/scripts/mint-credential.mjs CLIENT_CHATGPT
node transport/scripts/mint-credential.mjs CLIENT_CLAUDE
node transport/scripts/mint-credential.mjs OWNER

wrangler secret put SFL_CORRIDOR_CHATGPT_TOKEN_SHA256 --config transport/wrangler.toml
wrangler secret put SFL_CORRIDOR_CLAUDE_TOKEN_SHA256  --config transport/wrangler.toml
wrangler secret put SFL_CORRIDOR_OWNER_TOKEN_SHA256   --config transport/wrangler.toml

# 3. deploy. Mode stays TEST_PREVIEW — nothing can be published.
wrangler deploy --config transport/wrangler.toml

# 4. confirm
curl https://sfl-editorial-api.<subdomain>.workers.dev/v1/health
#    expect: {"ok":true,"mode":"TEST_PREVIEW","publicationEnabled":false,…}
```

Run it locally first, with no deployment at all:

```bash
SFL_CORRIDOR_CHATGPT_TOKEN_SHA256=$(node -e '…') node transport/runtime/node.mjs
```

---

## 9. Running the proofs

```bash
node --test transport/tests/transport.test.mjs    # 29 transport tests
node transport/e2e/live.mjs                       # 64 checks over real HTTP
node --test corridor/tests/corridor.test.mjs      # 23 corridor tests
node --test platform/tests/engine.test.mjs        # 76 public-engine tests
node corridor/e2e/acceptance.mjs                  # 47 corridor acceptance checks
```

`e2e/live.mjs` binds the real Node runtime to an ephemeral port on 127.0.0.1
and drives it with real `fetch` calls, because "the handler returns 401" and
"an HTTP request gets a 401" are not the same claim.

---

## 10. Known limitations, stated plainly

**KV has no compare-and-set.** Two Worker isolates handling two commands at the
same moment can both read snapshot *N* and both write *N+1*; one write is lost.
Honestly scoped: because the record id is derived from branch + slug, a lost
write means *the command may need retrying*, not that content was duplicated or
published twice. That is acceptable for the Phase 1 `TEST_PREVIEW` deployment —
one Owner, one client at a time, nothing public — and **must be replaced by a
Durable Object or a D1 transaction before `LIVE` publication**. The replacement
touches `runtime/store-kv.js` and `wrangler.toml` only; the corridor and the
handler do not change, because the seam is already there. Full note at the top
of `runtime/store-kv.js`.

**The corridor's rate limiter is per-isolate.** Like the shop Worker's
(`shop-worker/src/lib/ratelimit.ts`, same documented limitation), it bounds
volume per warm isolate, not globally. Keep it, and add a Cloudflare Rate
Limiting Rule on the route as the authoritative control.

**Node 22+.** The corridor's modules are `.js` files containing ESM syntax and
no `package.json` declares a module type for them, so they rely on Node 22's
module-syntax detection. `transport/package.json` declares `"type": "module"`
for this directory explicitly. Adding a one-line `corridor/package.json` with
`{"type":"module"}` would remove the dependency on that detection for the
corridor too — it was not added here because the corridor was not in scope for
this phase. Wrangler/esbuild is unaffected either way.

**No Worker route or custom hostname is configured.** `workers_dev = true`
gives a `*.workers.dev` URL. Attaching a hostname is DNS work and was not in
scope.

---

## 11. Honest status

**Phase 2 activation is packaged but NOT performed — see
[`PHASE2-ACTIVATION.md`](./PHASE2-ACTIVATION.md) for the two commands that do
it and the evidence they produce.** This container's egress proxy refuses all
outbound HTTPS (`CONNECT tunnel failed, response 403`), so no deployment and no
public-Internet validation was possible from here. The Worker was however
proven to *build* for the Workers runtime, and both activation scripts were
rehearsed end to end on loopback.

**Built, tested, proven over real HTTP on loopback, not deployed.**

| | |
| --- | --- |
| Transport code | complete, 29 tests + 64 live HTTP checks passing |
| PREPARE remotely | works — proven over a real socket, both clients |
| PREVIEW remotely | works — proven over a real socket, both clients, EN + FR |
| PUBLISH | Owner-gated, and additionally refused by `TEST_PREVIEW` at the edge |
| Deployed | **no.** No live endpoint exists |
| Credentials issued | **no.** None minted, none set, none in this repository |
| ChatGPT connected | **no.** The contract exists; the connector is not installed |
| Claude connected | **no.** The tool contract exists; it is not registered |
| Production content published | **no.** Nothing public was touched |

This session could not deploy: `api.cloudflare.com` returns HTTP 000 through
the agent proxy, `wrangler` is not installed, no Cloudflare credentials are
present in the environment, and the Cloudflare tooling available here is
read-only for Workers (list / get / get-code; no deploy). Deployment is the
Owner-side step in §8.
