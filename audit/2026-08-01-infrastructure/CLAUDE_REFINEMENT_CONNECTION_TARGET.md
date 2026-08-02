> **READ-ONLY AUDIT — 2026-08-01.** No infrastructure was modified. Nothing deployed, migrated or merged.
> Evidence sources: Cloudflare control-plane API (Workers/D1/R2/KV) and the local git repository.
> **All outbound HTTP from the audit environment is blocked** (every host returns `000`), so no live page,
> live endpoint or live redirect was fetched. Anything requiring HTTP or a Cloudflare API surface not
> exposed to this environment is marked **NOT VERIFIED**.

# Claude Refinement Layer — Connection Target

## Role separation to preserve

| Actor | Owns |
|---|---|
| **House of Assets** | Source of Truth; production factory; canonical masters |
| **Claude** | Refinement, QA, content, SEO — proposes, never publishes |
| **Shop** | Commerce and delivery |
| **Owner** | Sole approval authority |

## Safest connection point: none

Claude should hold **no credential** to the Bridge, the Shop, or Cloudflare, and should sit **out of
band** of every automated path. It receives inputs and returns artefacts; the Owner moves them across
each trust boundary.

```
House of Assets ──(Owner exports context)──> Claude ──(returns artefacts)──> Owner
                                                                               │
                                              ┌────────────────────────────────┤
                                              ▼                                ▼
                                  House of Assets (master)            Shop import / site
```

This is not a limitation to engineer away. It is what keeps "Owner is the approval authority" true
rather than aspirational. A Claude with write access to the factory *is* the factory.

## Roles, and what each actually requires

| Role | Input | Output | New infrastructure |
|---|---|---|---|
| Document QA | Built package | Findings report | None |
| Commercial QA | Listing copy | Claim-discipline report | None |
| Privacy QA | Package + manifest | Leak report | None |
| Cover refinement | Brief + draft | Image spec / candidate | None |
| Content engine | Product metadata | Article/blog drafts | Needs a content home (does not exist) |
| SEO engine | Page inventory | Metadata, internal links | Needs a content home |
| Marketplace refinement | Package | Improved manifest copy | None |

**Six of seven need nothing built.** They operate on files. The two content roles are blocked on the
absence of a content system, not on any Claude capability.

## Precedent already established

This session's `scripts/validate_product_aiops.py` is the pattern: Claude writes a checker, the checker
runs locally against artefacts, findings are reported, the Owner decides. It caught seven weak prompts,
twelve missing boundaries and one overclaim I had written myself. Machine-checkable QA beats review.

## Do not build

An automated Claude→Bridge→Shop pipeline. Every current bottleneck is production capacity, not
handoff latency. Automating the handoff would remove the Owner from the only place their judgement is
load-bearing.
