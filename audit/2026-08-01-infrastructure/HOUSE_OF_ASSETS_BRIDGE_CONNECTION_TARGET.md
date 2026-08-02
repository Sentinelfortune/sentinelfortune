> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# House of Assets → Shop: Smallest Safe Connection Point

**Nothing was connected in this mission.** House of Assets remains local.

## The connection already exists — and it is a file

The governed import contract (`b3622a8`) accepts a **ZIP with `PRODUCT-MANIFEST.json` v1**. That is the
integration surface. It requires no network path between House of Assets and Cloudflare, no tunnel, no
inbound exposure, and no credential exchange.

```
House of Assets (LOCAL, Source of Truth)
        │  Codex builds a conforming package
        ▼
<sku>-v<version>.zip   ← the entire contract
        │  Owner uploads through the Access-protected admin
        ▼
POST /shop/admin/import/commit  →  DRAFT product  →  Owner approval  →  Public Shop
```

## Answers to the questions posed

| Question | Answer |
|---|---|
| Where should Claude authenticate? | Nowhere new. Claude never touches the Bridge or the Shop directly. It receives context and returns artefacts; the Owner moves them. |
| Cloudflare Tunnel / API gateway? | **Not appropriate now.** A tunnel exposes a local machine to the internet permanently to solve a problem a file upload already solves. Revisit only when imports become frequent enough that manual upload is the bottleneck — not before. |
| Should app.sentinelfortune.com proxy Bridge access? | **Cannot be answered.** Nothing about that host is verified. Answering would be a guess. |
| Is direct Bridge exposure necessary? | **No.** The Bridge stays bound to localhost. |
| How to avoid moving 23.6 GB? | Structurally: the manifest declares only the finished deliverables for one SKU. The archive is never traversed, referenced or copied. A package is ~0.6 MB. |
| Selective canonical-asset retrieval? | `GET /api/bridge/v1/assets/{assetId}?download=1` locally, per asset, at package-build time only. |
| Where do refined results get written back? | House of Assets, via `POST /api/bridge/v1/actions`. The Shop is downstream and never writes back. |
| Where does public content enter? | Not through the import contract — see `PUBLIC_CONTENT_SEO_TARGET.md`. |

## Smallest safe next step

Have Codex emit a v1-conforming package for **one already-produced SKU** and validate it with
`POST /shop/admin/import/validate` (writes nothing). If it returns `valid: true`, the entire integration
is proven with zero infrastructure change.

Prerequisite: M2 + M3 — the import endpoints are not deployed yet.

## Boundary preserved

House of Assets is never named in customer-facing output, never exposed publicly, and remains the
Source of Truth. The Shop receives finished artefacts and never reaches back.
