# SFL EDITORIAL CORRIDOR — INTEGRATION CONTRACT

**ONE CORRIDOR · TWO ADAPTERS · SEVEN DESTINATIONS**

One governed channel through which **ChatGPT** and **Claude** can prepare,
preview and — on explicit Owner approval — publish **free editorial content**
into the seven Sentinel Fortune branches.

This document is the contract. If an integration does something this document
does not describe, the integration is wrong, not the corridor.

---

## 1. What the corridor is for

Free editorial work: teachings, lessons, sessions, articles, stories,
episodes, reflections, guides, tutorials, challenges, announcements,
collections.

## 2. What the corridor is explicitly NOT for

| Not this | Where it lives instead |
| --- | --- |
| Product pricing | House of Assets |
| Checkout, cart, payment | The Shop (Stripe) |
| Paid digital products | House of Assets → Shop |
| Infrastructure (DNS, Cloudflare, R2, Vercel) | Owner only |
| Git, filesystem, shell | Owner only |

House of Assets is **not a dependency** of this corridor. The corridor runs,
is tested, and produces its feed with House of Assets entirely absent. It may
*reference* an approved product; it has no authority over one.

---

## 3. The two entry points

```js
import { createCorridor } from "./corridor/actions.js";

const corridor = createCorridor();

corridor.chatgpt(request);   // ChatGPT action / connector  — flat, snake_case
corridor.claude(request);    // Claude tool call            — nested, camelCase
```

Both adapters translate and nothing more. Both produce the **same command
object** (`corridor/adapters/shared.js → toCommand`) and hand it to the **same
pipeline** (`corridor/core/pipeline.js → run`).

There is no Claude-only bypass and no ChatGPT-only shortcut. Test 2 asserts
that both adapters emit identical command keys, the same action and the same
record id for the same editorial piece.

### 3.1 ChatGPT request shape

```json
{
  "operation": "PREPARE",
  "instruction_id": "owner-2026-10-18-vibraflow-stillness-01",
  "user_message": "prépare un enseignement pour VibraFlow sur le silence du matin",
  "branch": "VIBRAFLOW_MEDIA",
  "content_type": "TEACHING",
  "title": "The Discipline of an Unhurried Morning",
  "slug": "discipline-of-an-unhurried-morning",
  "summary": "A teaching on the first twenty minutes, and what they decide.",
  "body": "…",
  "language": "en",
  "translations": { "fr": { "title": "…", "summary": "…", "body": "…" } },
  "topics": ["stillness"],
  "author_display": "Sentinel Fortune",
  "hero_media": {
    "kind": "HERO",
    "src": "https://sentinelfortune.com/assets/editorial/unhurried-morning.jpg",
    "source": "GOVERNED_GENERATED",
    "altText": "First light across a quiet room"
  },
  "cta": { "type": "SUPPORT_THE_WORK", "destination": "https://sentinelfortune.com/support" },
  "record_id": null
}
```

### 3.2 Claude request shape

```json
{
  "intent": "PREPARE",
  "instructionId": "owner-2026-10-18-academy-pricing-01",
  "ownerUtterance": "prepare a free lesson for the Academy about what a price communicates",
  "recordId": null,
  "editorial": {
    "branch": "LUMEN_SCHOOL_ACADEMY",
    "contentType": "LESSON",
    "title": "What a Price Actually Says",
    "slug": "what-a-price-actually-says",
    "summary": "…",
    "body": "…",
    "language": "en",
    "topics": ["pricing"],
    "cta": { "type": "READ_MORE", "destination": "/learn/what-a-price-actually-says" }
  }
}
```

### 3.3 Response shape

```json
{
  "ok": true,
  "step": "PUBLISH",
  "state": "PUBLISHED",
  "record": { "…": "the stored editorial record" },
  "audit": [ { "at": "…", "action": "…", "outcome": "PUBLISH:OK" } ],
  "client": "CLIENT_CHATGPT",
  "intent": "PUBLISH",
  "confident": true
}
```

A refusal is the same shape with `ok: false` plus `code` and `reason`, and
`step` names **where in the pipeline it stopped**, so "why did this not
publish" always has a precise answer:

```json
{ "ok": false, "step": "IDENTITY_VALIDATION", "code": "BRANCH_REJECTS_TYPE",
  "reason": "VibraFlow Media does not publish TUTORIAL — it covers teachings, reflections, rhapsodies, contemplative sessions, reading and listening" }
```

---

## 4. The action surface — the whole of it

```
create_draft   update_draft   get_preview   publish_approved
unpublish      archive        list_recent   get_record
```

Eight actions. Nothing else exists. There is no `deploy`, no `merge`, no
`push`, no `write_file`, no `run_command`, no `set_price`, no
`create_checkout`, no `update_dns`. These are not refused at runtime — they
are **not expressible**, which is a stronger guarantee than a check.

**Owner-only**, unreachable from either adapter:

```
approve    authorizeWithdrawal    reject    rollback
```

---

## 5. Intent resolution — the safety rule of the whole corridor

> **An unclear instruction resolves to PREPARE. Never to PUBLISH.**

`resolveIntent()` trusts an explicit intent in the envelope when it is one of
the seven known intents. Otherwise it reads the Owner's own words against
deliberately **narrow** English and French patterns. Anything else falls back
to `PREPARE` with `confident: false`.

`UNPUBLISH` and `ARCHIVE` are matched **before** `PUBLISH`, because the word
"unpublish" contains the word "publish".

A caller that receives `confident: false` should tell the Owner *"prepared —
say the word to publish"* rather than stay silent.

The two read intents, `LIST` and `GET`, are **explicit only**: they are never
inferred from the Owner's words. Reading is harmless, but guessing is not — if
*"show me the recent ones"* could resolve to `LIST`, then `PREVIEW` and `LIST`
would compete over the same phrasing and one of them would start losing. A
client that wants to read says so in the envelope.

---

## 6. The pipeline — nine ordered steps

```
COMMAND_VALIDATION → OWNER_AUTHORITY → NORMALIZE → IDENTITY_VALIDATION
→ EDITORIAL_VALIDATION → MEDIA_RIGHTS → PREVIEW_BUILD → APPROVAL_STATE → PUBLISH
```

Idempotency is checked **before** step 1, so a retry never re-enters the
pipeline at all. Every step appends an audit entry.

---

## 7. The state machine

```
DRAFT ─┬─→ PREVIEW ─┬─→ APPROVED ──→ PUBLISHED ─┬─→ UNPUBLISHED ──→ PUBLISHED
       │            │       │                   └─→ ARCHIVED
       └────────────┴───→ REJECTED ──→ DRAFT / ARCHIVED
```

* **Public states: `PUBLISHED` only.** `isPublic()` is the single place that
  decides, so `DRAFT`, `PREVIEW` and `APPROVED` cannot reach the feed by any
  route.
* `canPublish()` allows publication only from `APPROVED` or `UNPUBLISHED`.
  **There is no path that turns a DRAFT public in one step.**
* `ARCHIVED` is terminal.

---

## 8. Owner approval — scoped, versioned, and spent

1. The Owner calls `approve({ recordId })`. This transitions the record to
   `APPROVED` and mints an approval naming **the record, the action and the
   version**.
2. The approval is held by the corridor, keyed by *record + action*. **It never
   appears in any request shape either adapter accepts**, so a client cannot
   supply, forge or guess one.
3. An approval is **scoped to one action**: permission to take something down
   can never be spent on putting something up. Withdrawals use the separate
   `authorizeWithdrawal({ recordId, action })`.
4. An approval is **versioned**. If a client updates the record afterwards, the
   publish is refused with `APPROVAL_STALE`. This closes the obvious attack:
   get approval for innocuous text, then swap the text before publishing.
5. An approval is **spent** on use. Publishing twice needs approving twice.
6. `rollback` and `reject` invalidate every outstanding approval for that
   record.

---

## 9. Idempotency

Every command carries an `instruction_id` / `instructionId`. Replaying one
returns the **original outcome**, writes nothing, bumps no version and creates
no duplicate. A command with no instruction id is refused at
`COMMAND_VALIDATION` with `NO_INSTRUCTION_ID`.

The record id is derived deterministically from `branch + slug`, so the same
editorial piece keeps the same identity across clients and across retries.

---

## 10. Versioning — nothing is destroyed

* An update pushes the previous version onto `revisionHistory` and increments
  `version`.
* `unpublish` and `archive` change **state only**. Text, translations, media
  and audit all survive.
* `rollback` restores an earlier version **as a new version**, so the act of
  rolling back is itself in the history.

---

## 11. The seven destinations

| Token | Public identity | Accepts |
| --- | --- | --- |
| `SENTINEL_FORTUNE_RECORDS` | `sentinelfortunerecords` | SESSION, AUDIO, PODCAST, ARTICLE, ANNOUNCEMENT, EDITORIAL_COLLECTION, LESSON |
| `CODEX_WORLD_TV` | `codexworldtv` | STORY, EPISODE, ARTICLE, ANNOUNCEMENT, EDITORIAL_COLLECTION |
| `LUMEN_GAME` | `lumengame` | CHALLENGE, SESSION, ARTICLE, ANNOUNCEMENT, TUTORIAL, EDITORIAL_COLLECTION |
| `LUMEN_SCHOOL_ACADEMY` | `lumenschoolacademy` | LESSON, GUIDE, TUTORIAL, ARTICLE, SESSION, ANNOUNCEMENT, EDITORIAL_COLLECTION |
| `VIBRAFLOW_MEDIA` | `vibraflowmedia` | TEACHING, REFLECTION, RHAPSODY, SESSION, AUDIO, PODCAST, ARTICLE, EDITORIAL_COLLECTION |
| `LIGHTNODE_SYSTEMS` | `lightnodesystems` | TUTORIAL, GUIDE, ARTICLE, LESSON, ANNOUNCEMENT, EDITORIAL_COLLECTION |
| `OG_LEGACY_STORE` | `oglegacystore` | EDITORIAL_COLLECTION, ARTICLE, ANNOUNCEMENT, STORY |

**The branch is always explicit.** The corridor never infers a destination and
never re-infers one after the Owner has chosen. A branch that does not publish
a kind of work **refuses** it; it does not redirect it. Being told *"VibraFlow
does not take tutorials"* is useful. Being silently moved to LightNode is not.

A slug is unique **within** a house. The same slug in two houses is two
different things, kept apart by id and by the engine's identity router.

---

## 12. ONE ENGINE — how this is literally true

Editorial content types are a **publishing vocabulary**, not a storage format.
Each maps, through one table (`corridor/schema/record.js → PRESENTATION`), onto
a presentation type the existing public engine **already renders**:

| Editorial type | Presents as |
| --- | --- |
| ARTICLE, LESSON, GUIDE, TUTORIAL, ANNOUNCEMENT | `COURSE` |
| TEACHING, REFLECTION, RHAPSODY | `TEACHING` |
| SESSION, AUDIO, PODCAST | `PODCAST` |
| STORY, EPISODE | `STORY` |
| CHALLENGE | `GAME` |
| EDITORIAL_COLLECTION | `BUNDLE` |

The corridor emits records in the engine's **existing** `sf.public-site/1.0`
envelope. Consequently:

* **no new public engine**
* **no new renderer**
* **no new feed shape**
* **no second website**
* **no hand-written page**

Adding an editorial type is a row in that table. The acceptance run proves it
by passing the corridor's own feed through the engine's own ingestion gate
(`selectPublic`) unchanged, and reading back `type: "TEACHING"` and
`type: "COURSE"`.

---

## 13. The commercial boundary

The corridor publishes free work. `assertNoCommercialAuthority()` **refuses**
rather than silently strips, so a client learns the boundary instead of
wondering why its field vanished:

* `price` — refused
* `compareAtPrice` — refused
* `pricingTier` other than `"FREE"` — refused
* `checkoutUrl` — refused
* a `VIEW_PRODUCT` CTA carrying a price — refused
* a `VIEW_PRODUCT` CTA pointing at `/checkout`, `/cart` or `stripe.com` —
  refused

Every published record carries `pricingTier: "FREE"`, hardcoded. No `price`
key is ever emitted. **The corridor cannot express a price, so it cannot leak
one.**

### 13.1 SUPPORT_THE_WORK is not a purchase

`SUPPORT_THE_WORK` maps to the engine CTA kind `SUPPORT` — its own kind in
`platform/engine/core.js`, in the engine's free-actions list, beside and
distinct from `BUY`. `VIEW_PRODUCT` maps to `OPEN`.

**No editorial CTA maps to `BUY`.** The corridor has no authority to put a
price on anything, so it may never emit the action that implies one.

---

## 14. Media and rights

Source priority, highest first: `OWNER_PROVIDED` → `GOVERNED_GENERATED` →
`APPROVED_PUBLIC` → `PREMIUM_FALLBACK`.

* An asset with no declared source is refused.
* `SCRAPED` is refused **by name**. Benchmark imagery is never reused.
* `APPROVED_PUBLIC` requires `rights.licence` **and**
  `rights.approved === true`.
* Every visual medium requires `altText` — not as an accessibility nicety, but
  because a publishing system that cannot describe its own image does not know
  what it is publishing.
* A record with no usable hero is a **deliberate outcome**: the public engine
  draws its own deterministic premium artwork. It is never a broken image.

Licence and approval detail stay internal. `publicMedium()` emits only kind,
src and alt.

---

## 15. Languages

One canonical record plus `translations`, **never a duplicate record per
language** — that is how two languages drift apart. Supported: `en`, `fr`.
A translation in the canonical language is refused as a mistake. A missing
translation falls back to the canonical language rather than showing an empty
page.

---

## 16. What never reaches the public

```
audit  revisionHistory  rights  sourceClient  ownerInstructionId
ownerApproval  status  price  compareAtPrice  checkoutUrl  body
```

(`body` is republished as `description`; the raw internal field is not.)

Asserted by test 16 and by the acceptance run.

---

## 17. Security model

| Requirement | How it is met |
| --- | --- |
| No credential in a public repo | No credential value exists anywhere in the corridor. An identity stores only a `credentialRef` — the **name** of the secret (`SFL_CORRIDOR_CHATGPT_TOKEN`), never a value. |
| No credential in logs | Audit entries carry action, client, intent, outcome and a short detail. Test 18 serializes the entire store and audit trail and asserts no credential pattern appears. |
| Rate limited | A rolling one-hour window per client (`rateLimitPerHour`, default 60). A runaway loop cannot fill the editorial store; a compromised credential hits a ceiling. |
| Auditable | Every pipeline step and every Owner act appends an entry. `corridor.auditTrail()` returns the lot, time ordered. |
| Least privilege | Eight actions, listed in §4. No filesystem, Git, shell or production-infrastructure authority is expressible. |
| Revocable | `clientIdentity(..., { revoked: true })` stops that client at `OWNER_AUTHORITY` before anything is evaluated. |
| Unknown client | Refused with `UNKNOWN_CLIENT` before the command is read. |

---

## 18. Error codes

| Code | Step | Meaning |
| --- | --- | --- |
| `NO_ACTION` | COMMAND_VALIDATION | the command names no action |
| `NO_INSTRUCTION_ID` | COMMAND_VALIDATION | no instruction id, so a replay could duplicate a publication |
| `RATE_LIMITED` | COMMAND_VALIDATION | the client's hourly allowance is spent |
| `UNKNOWN_CLIENT` | OWNER_AUTHORITY | the caller is not a registered corridor client |
| `REVOKED` | OWNER_AUTHORITY | the client's credentials were revoked |
| `NO_SUCH_ACTION` / `NOT_PERMITTED` | OWNER_AUTHORITY | the action is not on the allow-list |
| `OWNER_APPROVAL_REQUIRED` | OWNER_AUTHORITY | an AI client cannot approve its own publication |
| `APPROVAL_MISMATCH` | OWNER_AUTHORITY | the approval refers to a different record |
| `APPROVAL_STALE` | OWNER_AUTHORITY | the record changed after the Owner approved it |
| `UNKNOWN_BRANCH` | IDENTITY_VALIDATION | not one of the seven |
| `BRANCH_REJECTS_TYPE` | IDENTITY_VALIDATION | that house does not publish that kind of work |
| `SLUG_TAKEN` | IDENTITY_VALIDATION | that house already has that slug |
| `INVALID_RECORD` | EDITORIAL_VALIDATION | every problem, reported at once |
| `MEDIA_REFUSED` | MEDIA_RIGHTS | source, rights or alt text missing or forbidden |
| `NOT_FOUND` | — | no such record |
| `NOT_APPROVED` | APPROVAL_STATE | the record is not in a publishable state |
| `ILLEGAL_TRANSITION` | APPROVAL_STATE | that state change is not in the table |

---

## 19. Output

`corridor.feed()` returns the public editorial feed in the engine's existing
envelope. `corridor.feedForBranch(identitySlug)` returns one house's view,
which is how cross-branch leakage is proved absent rather than assumed.

```json
{
  "schema": "sf.public-site/1.0",
  "evidence": "TEST_PREVIEW",
  "source": { "system": "HOUSE_OF_ASSETS", "channel": "SFL_EDITORIAL_CORRIDOR", "generated_at": "…" },
  "records": [ { "id": "…", "identity": "lumenschoolacademy", "type": "COURSE", "pricingTier": "FREE", "…": "…" } ]
}
```

`publishAt` and `expiresAt` are honoured at feed-build time: a scheduled
record does not appear early and an expired one simply stops appearing.

---

## 20. Persistence seam

The store is in-memory by design, with `snapshot()` and `restore()` as the only
persistence surface. The corridor's logic must be testable without a database
and its transport must be replaceable, so persistence is a **boundary**, not a
dependency. A Git-backed or API-backed transport implements those two methods
and nothing else changes.

---

## 21. Running it

```bash
node --test corridor/tests/corridor.test.mjs     # 22 governing tests
node corridor/e2e/acceptance.mjs                 # the end-to-end demonstration
```

The acceptance run writes `corridor/editorial/public-feed.json`.

---

## 22. TRANSPORT DECISION — Git-backed vs authenticated API

Two transports can carry this contract. The corridor core is identical under
both; only the persistence seam (§20) differs.

### Option A — Git-backed

The corridor's store snapshot is a JSON file in the repository. A client's
command is applied, the snapshot is written, committed and pushed; the public
feed is a built artefact and the site redeploys.

**For**

* Every publication is a commit: author, timestamp, diff, revert — the audit
  trail is the Git history, which no one can quietly edit.
* No server to run, no uptime to own, no endpoint to attack.
* Preview environments come free from the existing deployment setup.

**Against**

* **It requires giving a client Git write authority**, which is precisely what
  the mission forbids: *"Do NOT give either AI unrestricted filesystem, Git or
  production infrastructure authority."* A scoped bot credential narrows it but
  does not remove it — a Git token that can commit can commit anything.
* Publishing latency is a deploy cycle, not a request.
* Two clients publishing at once produce a merge conflict, not a queued write.
* `unpublish` is a deploy, so "take it down now" is minutes, not seconds.

### Option B — Authenticated API (**RECOMMENDED**)

A small authenticated endpoint in front of `corridor/actions.js`. Each client
presents its own bearer credential; the endpoint resolves it to a
`clientIdentity` and calls `corridor.chatgpt()` or `corridor.claude()`. The
store persists through the §20 seam (Cloudflare KV, D1 or R2 — all already in
the stack). The public feed is written on publish.

**For**

* **Least privilege is achievable.** The credential buys exactly the eight
  actions in §4 and nothing else. No Git, no filesystem, no shell, no
  infrastructure. This is the mission's own constraint, met structurally.
* Per-client rate limiting and revocation are already implemented (§17) and
  take effect immediately — revoking a Git token does not un-push a commit.
* Idempotency works as designed: the instruction-id ledger is a single
  authoritative store, not a branch that can diverge.
* `unpublish` is a request, so "take it down now" is seconds.
* Concurrent writes from two clients serialize instead of conflicting.
* This is the shape a ChatGPT connector/action expects natively — an OpenAPI
  endpoint, not a Git remote.

**Against**

* There is a service to deploy and keep up.
* Credential rotation needs a real procedure.
* The audit trail lives in the corridor's store rather than in Git history, so
  that store must itself be backed up.

### The decision

**Authenticated API, with the Git repository as the published artefact rather
than the write path.**

The deciding factor is not convenience: it is that Option A cannot satisfy
"no unrestricted Git authority" without becoming Option B anyway. A corridor
whose least-privilege guarantee depends on a Git token being well behaved does
not have a least-privilege guarantee. Option B makes the guarantee structural —
the authority simply does not exist on the other side of the credential.

The corridor is written so this decision costs nothing to defer or reverse:
nothing in `schema/`, `core/` or `adapters/` knows which transport it is
under.

---

## 23. HONEST STATUS

What is built, tested and demonstrated:

* the corridor core, both adapters, the nine-step pipeline, the state machine,
  Owner approval, idempotency, versioning, rollback, media rights, the
  commercial boundary, the public feed;
* 22 governing tests, all passing;
* an end-to-end acceptance run covering both clients, both replays and a
  withdrawal, all checks passing;
* the `SUPPORT` CTA kind added to the public engine so support stays distinct
  from purchase — the engine's own 76 tests still pass.

What is **not** yet true, stated plainly:

* **No ChatGPT connector or action has been installed or authorized.** ChatGPT
  cannot publish from a chat today. What exists is the contract and the adapter
  it would call. Installing and authorizing the connector is an Owner-side
  step.
* **No transport is deployed.** There is no live endpoint and no credential has
  been issued. §22 is a recommendation, not a deployment.
* **Nothing has been published to a production branch.** The acceptance run
  uses TEST/PREVIEW records, an in-memory store and one local file.
* **No production DNS, Cloudflare, Stripe, R2, Shop fulfillment or
  institutional-site deployment has been touched.**
