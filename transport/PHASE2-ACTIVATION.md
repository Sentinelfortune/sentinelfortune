# PHASE 2 — ACTIVATION RUNBOOK (TEST_PREVIEW ONLY)

Everything needed to put the verified SFL Editorial Transport on the public
Internet, in TEST_PREVIEW mode, and prove it.

**This session could not perform the deployment.** All outbound HTTPS is
refused at this container's egress proxy with `CONNECT tunnel failed,
response 403` — `api.cloudflare.com`, `dash.cloudflare.com` and even
`example.com` all return nothing. There are no Cloudflare credentials in the
environment, `wrangler` was not installed, and the Cloudflare tooling reachable
from here is read-only for Workers (list / get / get-code; there is no deploy
call). So Phase 2 is packaged to be run by the Owner in one command, and
verified by a second.

What this session *could* do, it did — see §5.

---

## The two commands

```bash
# 1. activate  (creates the KV namespace, mints 3 credentials, sets 3 secrets, deploys)
bash transport/scripts/deploy-test-preview.sh

# 2. prove     (runs all of §4 of the mission against the real Worker)
SFL_API_BASE=https://sfl-editorial-api.<subdomain>.workers.dev \
SFL_CRED_DIR=~/.sfl-editorial \
  node transport/scripts/validate-remote.mjs
```

Then build the client packages:

```bash
node transport/scripts/make-connector.mjs https://sfl-editorial-api.<subdomain>.workers.dev
```

---

## 1. What `deploy-test-preview.sh` does, in order

| Step | Action |
| --- | --- |
| 1/6 | checks wrangler, Node ≥ 22, and a real Cloudflare login |
| 2/6 | **builds the Worker offline first** — nothing is created in the account until it is known to build |
| 3/6 | creates (or reuses) the KV namespace and writes its id into `wrangler.toml` |
| 4/6 | mints `CLIENT_CHATGPT`, `CLIENT_CLAUDE`, `OWNER` into `~/.sfl-editorial` (0700, files 0600) |
| 5/6 | pipes each **digest** into `wrangler secret put` over stdin |
| 6/6 | `wrangler deploy --env=""` and prints the hostname |

### Secret hygiene, by construction

- no token or digest is ever echoed;
- no digest is passed as a command-line argument, because arguments are visible
  to `ps` for the life of the process — they go in over **stdin**;
- `set +x` is asserted, so running the script with tracing on cannot leak the
  values through the trace;
- `mint-credential.mjs --out` **refuses** any directory inside this repository.
  Verified: pointing it at `./transport/secrets` is rejected outright;
- the three `.token` files are left 0600 for pasting into the clients, and the
  script's last instruction is to delete them. The digests may stay — a digest
  is not a credential.

### What it will not do

It will not set `SFL_CORRIDOR_MODE=LIVE`, will not deploy `--env production`,
and will not touch DNS, a custom hostname, Stripe, R2, the Shop, House of
Assets or any of the seven canonical subdomains. It deploys one isolated Worker
on its `workers.dev` hostname. The Worker name `sfl-editorial-api` was checked
against the account's 68 existing Workers and is free.

---

## 2. What `validate-remote.mjs` proves

Every check Phase 2 §4 and §5 require, against the real Worker, over the public
Internet. 69 checks in 12 sections:

| Section | Checks |
| --- | --- |
| 1 Public reachability | `/v1/health` 200, mode `TEST_PREVIEW`, `publicationEnabled: false`, no principal disclosure, `no-store`, https; `/v1/contract` lists the eight actions and no Owner action |
| 2 Unauthorized | no credential → 401 generic + `WWW-Authenticate`; wrong credential → 401 generic |
| 3 Revocation | second pass — see below |
| 4 ChatGPT | PREPARE → 200 `create_draft` `DRAFT` `isLive:false` routed to VibraFlow; PREVIEW → `preview:true`, `isLive:false` twice, EN + FR |
| 5 Claude | PREPARE → 200 `DRAFT` routed to the Academy, same pipeline step as ChatGPT; PREVIEW → `preview:true`, `isLive:false` |
| 6 Boundary | all four `/v1/owner/*` POSTs with a client token → 403 `OWNER_ROUTE`; Owner token on `/v1/editorial` → 403 `CLIENT_ROUTE` |
| 7 Idempotency | duplicate instruction id → `replay:true`, same record, no version bump; `Idempotency-Key` mismatch → 400; missing instruction id → 400 |
| 8 Forbidden commercial | checkout CTA → 400 `INVALID_RECORD` at `EDITORIAL_VALIDATION`; price / tier / checkoutUrl never stored; `SCRAPED` media → 400 `MEDIA_REFUSED`; wrong house → `BRANCH_REJECTS_TYPE` |
| 9 Publication | PUBLISH unapproved → 403; Owner approves → 200; **PUBLISH with a valid approval → 403 `PUBLICATION_DISABLED`** |
| 10 Safety assertion | **the public feed contains ZERO records**, marked evidence `TEST_PREVIEW`, schema `sf.public-site/1.0`, no stored record `PUBLISHED` |
| 11 Secrets | no response echoed any token; no 64-hex digest in any response |
| 12 Cleanup | the run archives the two records it created; the feed is still empty afterwards |

It writes `sfl-remote-validation-<runId>.json` next to the credentials
(outside the repo). **The report contains no credential** — asserted by
section 11, which greps every response for the tokens it just used.

Its test records are slugged `sfl-validation-<runId>` so they are unmistakable,
and it archives them before finishing.

### The revocation check needs a second pass

Revocation is a deployment variable, so it cannot be exercised in the same pass
as the working credentials. Pass 1 reports it `NOT_TESTED` rather than
pretending. To test it:

```bash
# 1. set SFL_CORRIDOR_REVOKED = "CLIENT_CHATGPT" in transport/wrangler.toml
wrangler deploy --env="" --config transport/wrangler.toml
node transport/scripts/validate-remote.mjs --revoked CLIENT_CHATGPT
# 2. set it back to "" and deploy again
```

The `--revoked` pass deliberately stops after proving the refusal, the
isolation of the other principals, and that the feed is still empty. Running
the rest of the suite with a credential revoked would report failures that are
the correct behaviour.

### Status values it can return

| | |
| --- | --- |
| `REMOTE_TRANSPORT_VERIFIED` | public Internet, zero failures, nothing untested |
| `REMOTE_TRANSPORT_PARTIAL` | public Internet, zero failures, revocation pass still outstanding |
| `REMOTE_TRANSPORT_FAILED` | any check failed |
| `LOCAL_REHEARSAL_ONLY` | the target was loopback — **can never read VERIFIED, however green** |

---

## 3. Persistence used in this phase

**Cloudflare KV**, through the corridor's existing `snapshot()` / `restore()`
seam (`runtime/store-kv.js`). Nothing else: no D1, no Durable Object, no R2.

**This is not production-grade publication persistence, and must not be
described as such.** KV has no compare-and-set, so two Worker isolates handling
two commands at the same moment can both read snapshot *N* and both write
*N+1*, losing one write.

Scoped honestly: because a record's id is derived from branch + slug, a lost
write means *a command may need retrying*, not that content was duplicated or
published twice. That is acceptable for TEST_PREVIEW — one Owner, one client at
a time, nothing public — and is **not** acceptable for publication, where a
lost write could drop an Owner approval or a state change.

### Required before LIVE

Replace KV with a **Durable Object** (single-threaded per object, so reads and
writes serialize) or **D1 with a transaction**. This touches
`runtime/store-kv.js` and `wrangler.toml` only — the corridor and the request
handler do not change, because the seam is already there. Then, and only then,
`SFL_CORRIDOR_MODE` may be considered for `LIVE`, and the corridor's
Owner-approval gate still applies unconditionally on top of it.

---

## 4. Connecting the clients

Only after `validate-remote.mjs` reports `REMOTE_TRANSPORT_VERIFIED`.

```bash
node transport/scripts/make-connector.mjs https://sfl-editorial-api.<subdomain>.workers.dev
```

It copies the committed contracts, changes **only** the server URL, and refuses
to write unless it has verified — structurally, against the generated output —
that:

- no Owner route is a callable path or endpoint;
- no Owner action appears as an operation, a tool, or in `scopeModel.grants`;
- nothing token-shaped, digest-shaped or key-shaped is embedded;
- no `REPLACE_WITH` placeholder survived.

Verified in this session: the generated ChatGPT package exposes exactly
`/v1/health`, `/v1/contract`, `/v1/editorial` — and nothing else.

**ChatGPT:** import `contracts/generated/openapi.chatgpt.json` as a connector /
custom action; authentication is an API key in the `Authorization` header with
the value `Bearer <CLIENT_CHATGPT token>`.

**Claude:** register `contracts/generated/claude-tools.json`; authentication is
the `CLIENT_CLAUDE` token as the bearer credential. Same Worker, same endpoint,
same eight actions — **no Claude-specific publishing bypass exists**, and the
transport tests assert the two clients differ only in which adapter their
credential selects.

Delete the `.token` files once pasted.

---

## 5. What this session verified without network access

| Check | Result |
| --- | --- |
| The Worker **builds** for the Workers runtime | `wrangler deploy --dry-run` — 67.62 KiB, gzip 18.24 KiB |
| …in the production environment too | same bundle, mode correctly pinned `TEST_PREVIEW` |
| No `node:` builtin in the Worker graph | **zero** — the bundle imports none |
| No credential literal in the bundle | only variable *names* (`SFL_CORRIDOR_*_SHA256`) |
| The Worker name is free | checked against the account's 68 Workers |
| `validate-remote.mjs` is itself correct | rehearsed against `runtime/node.mjs` on loopback: **68 passed, 0 failed**, 1 `NOT_TESTED` (revocation), status correctly refused to read VERIFIED |
| The `--revoked` second pass is correct | rehearsed: **20 passed, 0 failed** |
| `deploy-test-preview.sh` gates correctly | stops at step 1/6 with "wrangler is not logged in" and leaves `wrangler.toml` untouched |
| `mint-credential.mjs --out` refuses the repo | verified; writes 0700 dir, 0600 files, prints no secret |
| `make-connector.mjs` refuses bad output | verified; rejects non-https, and caught a real over-broad check in its own first draft |
| Transport / corridor / engine suites | 29 / 23 / 76 passing, plus 47 corridor acceptance checks |

Two defects were found and fixed by this rehearsal rather than by the Owner in
production:

1. `validate-remote.mjs` **crashed** on the `--revoked` pass — it read
   `.record.identity` on a response that was correctly a refusal.
2. `deploy-test-preview.sh` had an **ineffective login gate** — `wrangler
   whoami` prints "You are not authenticated" and still **exits 0**, so the
   script marched past it and failed later at KV creation. It now inspects the
   output.

---

## 6. Confirmed untouched

`main`; GitHub Pages production; the seven canonical subdomains;
`sentinelfortune.com`; House of Assets; the Shop; Stripe; production R2; public
editorial content; the public engine architecture; DNS.

No production content was published. No credential was created in this session.
No endpoint exists yet.
