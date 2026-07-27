# Sentinel Fortune LLC — Production System v2.0

**Multi-domain monetization platform** operating across 8 domains.

## Structure
```
/bot        — Telegram bot (aiogram 3, 6-tier money engine)
/backend    — Express API (6 routes, Stripe, R2)
/frontend   — SFL Network Hub (React+Vite, 21 routes)
/config     — Cloudflare Workers + deployment scripts
/docs       — System documentation
```

## Bot Commands
| Command | Action |
|---------|--------|
| `/start` | Onboarding + deep-link entry |
| `/enter` | Register user → POST /api/enter-system |
| `/buy [tier]` | Stripe checkout link |
| `/status` | GET /api/status/:id |

## 6 Tiers
`lite $2` · `monthly $25/mo` · `starter $290` · `pro $1,900` · `oem $7,500` · `licensing $15,000`

## 8 Domains
`sentinelfortune.com` · `sentinelfortunerecords.one` · `codexworldtv.homes` · `lumengame.vip`
`lumenschoolacademy.online` · `vibraflowmedia.casa` · `lightnodesystems.my` · `oglegacystore.homes`

## Hard Rules
- Never modify `originus/_canon/` in R2
- Never touch `delivery_service.py`
- All bot→API calls via HTTP (no direct R2 access)

## Digital Shop (new, isolated)

A separate, isolated Digital Shop MVP for one-time digital-product sales lives in `/shop-worker`
(Cloudflare Worker backend), `/shop` (public storefront pages), and `/admin` (Owner Admin UI). It does not
modify, extend, or depend on anything above — no live product is published yet. Start at
`SHOP_MVP_README.md`.
