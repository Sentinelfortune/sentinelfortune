# SFL Editorial Corridor — the callable contract

One endpoint. Both assistants. No second publishing system.

```
POST https://onecompany.sentinelfortune.com/api/corridor
Authorization: Bearer <CORRIDOR_TOKEN_CLAUDE | CORRIDOR_TOKEN_CHATGPT>
Content-Type: application/json
```

The credential chooses the adapter. There is no `provider` field, no
per-assistant route, and no branch in the handler — which is what makes this
one corridor rather than two systems wearing one name. Whichever token is
presented becomes the `created_by` and `adapter` in the audit trail.

## Required environment (Vercel production, `platform` project)

| Name | Purpose |
|---|---|
| `CF_ACCOUNT_ID` | Cloudflare account |
| `CF_D1_DATABASE_ID` | `11008805-0cf6-4f01-b2ca-b22792d1ef15` |
| `CF_API_TOKEN` | **public feed reads only** — D1 read scope |
| `CF_D1_WRITE_TOKEN` | **every corridor operation** |
| `CORRIDOR_TOKEN_CLAUDE` | Claude's bearer credential |
| `CORRIDOR_TOKEN_CHATGPT` | ChatGPT's bearer credential — a *different* value |
| `CORRIDOR_TOKEN_OWNER` | the Owner's own credential — a *third* value, the only one that may `approve` |
| `CORRIDOR_STANDING_POLICY` | optional; absent means every publish needs an explicit Owner approval |

Until the `CORRIDOR_TOKEN_*` values exist the endpoint answers `401` to
everything. That is the correct closed default, not a fault.

Generate each as an opaque high-entropy string (e.g. `openssl rand -hex 32`)
and set it as a **sensitive** production variable. A sensitive value cannot be
read back from Vercel afterwards, so keep your own copy: the assistant
connector needs the value, and the dashboard will not give it to you twice.

## Actions

All ten take `{"action": "<name>", ...}`. Add `"idempotency_key"` to any
write and a retry returns the first result instead of acting twice.

### create_draft

```json
{
  "action": "create_draft",
  "type": "TEACHING",
  "title": "The Cost of an Unmade Decision",
  "summary": "A decision you keep postponing is not free.",
  "body": "Paragraph one.\n\nParagraph two.",
  "cover_image": { "src": "https://vibraflowmedia.sentinelfortune.com/assets/cover.webp", "alt": "A quiet desk at dawn" },
  "inline_images": [{ "src": "/assets/figure-1.webp", "alt": "Diagram of the loop" }],
  "media_refs": [{ "kind": "AUDIO", "src": "https://vibraflowmedia.sentinelfortune.com/assets/read-aloud.mp3", "alt": "Read aloud" }],
  "attachments": [{ "src": "https://vibraflowmedia.sentinelfortune.com/assets/worksheet.pdf", "title": "Free worksheet (PDF)", "format": "pdf" }],
  "categories": ["Decision-making"],
  "idempotency_key": "teaching-unmade-decision-1"
}
```

`identity` is optional when the editorial type implies one. An explicit
`identity` always wins.

### The editorial vocabulary, and where each one lands

| Say this | Governed type | World | Public path |
|---|---|---|---|
| `TEACHING` · `REFLECTION` · `ARTICLE` · `ANNOUNCEMENT` | `TEACHING` | VibraFlow Media | `/reflect/` |
| `LESSON` | `COURSE` | Lumen School Academy | `/learn/` |
| `TECHNICAL_NOTE` | `SOFTWARE` | LightNode Systems | `/systems/` |
| `STORY` | `STORY` | Codex World TV | `/story/` |
| `EDITORIAL_EPISODE` | `PODCAST` | VibraFlow Media | `/reflect/` |
| `MUSIC_RELEASE_NOTE` | `MUSIC_RELEASE` | Sentinel Fortune Records | `/release/` |
| `GAME_UPDATE` | `GAME` | Lumen Game | `/play/` |
| `EDITORIAL_COLLECTION` | `BUNDLE` | OG Legacy Store | `/offer/` |
| `FREE_EBOOK` | `BOOK` | VibraFlow Media | `/reflect/` |

These are **aliases onto types that already exist**. No new renderer, no
eighth world. A governed type may also be given directly, with an `identity`.

### The rest

| Action | Body | Notes |
|---|---|---|
| `update_draft` | `record_id` + any of `title`, `summary`, `body` | bumps `version` |
| `get_preview` | `record_id` | returns `preview_url`, and `public_url` only once published |
| `submit_review` | `record_id` | `DRAFT → REVIEW`; any caller may ask |
| `approve` | `record_id` | `REVIEW → APPROVED`. **Owner credential only** — `403 OWNER_CREDENTIAL_REQUIRED` for an assistant token |
| `publish_approved` | `record_id` | `409 OWNER_REVIEW_REQUIRED` unless APPROVED or covered by standing policy |
| `unpublish` | `record_id` | returns a `rollback_reference` |
| `archive` | `record_id` | refused while PUBLISHED — unpublish first |
| `list_recent` | optional `identity`, `limit` | |
| `get_record` | `record_id` | includes the full event history |

## What the corridor refuses

- **Publishing unapproved work.** `REVIEW → APPROVED` is reachable only with
  the Owner's own credential. An assistant cannot approve its own writing —
  enforced by the credential, before the record is even read.
- **Selling.** `pricing_tier` is pinned to `FREE` by a database constraint and
  no action writes a price. Paid work goes through House of Assets.
- **An eighth world.** `identity` is checked here and again by a D1 CHECK.
- **A type a world does not present.** `TYPE_NOT_ACCEPTED_BY_WORLD`, with that
  world's actual types named. It will not guess a destination.
- **Ungoverned media.** Every `src` must be site-relative or https on a
  Sentinel Fortune host. Off-host media is *refused*, not silently dropped.

## Wiring the assistants

**ChatGPT** — add a custom action / connector pointing at the URL above, auth
type Bearer, with `CORRIDOR_TOKEN_CHATGPT` as the token. One operation
(`POST /api/corridor`) covers every action via the `action` field.

**Claude** — the same endpoint as a connector with the same Bearer scheme,
using `CORRIDOR_TOKEN_CLAUDE`.

**The Owner** — approving is a decision, not a drafting step, so give
`CORRIDOR_TOKEN_OWNER` to whichever surface you want to approve from and keep
it out of both assistant connectors. Assistants draft and submit; you approve;
then anyone may publish what you approved.

Neither assistant receives a Cloudflare token, a D1 database id, or any
infrastructure credential. They get one URL and one bearer value, and the
server does the rest.
