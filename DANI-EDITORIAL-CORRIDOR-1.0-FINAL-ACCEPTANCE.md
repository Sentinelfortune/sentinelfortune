# DANI EDITORIAL CORRIDOR 1.0 — ACCEPTATION FINALE

Sentinel Fortune LLC · 2026-10-22 · préparé par Claude Code (session cloud)

## Verdict : **BLOCKED** — système prêt à déployer, mais pas opérationnel

Le code est terminé et sécurisé, et il est prouvé sur le vrai runtime Workers
(workerd), exécuté localement sur loopback.
La Définition de Done n'est **pas** atteinte :

- aucun Worker n'est déployé ;
- aucun connecteur n'a été appelé depuis ChatGPT ou Claude ;
- aucune publication n'a eu lieu.

Le blocage est externe et démontré : cette session ne peut joindre ni
Cloudflare, ni `workers.dev`, ni ChatGPT, ni Vercel (§1). Chaque étape
restante relève du propriétaire (§13).

Aucun PASS de ce rapport ne concerne un endpoint distant. « workerd » désigne
le runtime Workers de Cloudflare exécuté localement sur 127.0.0.1.

---

## 1. Lieu d'exécution et blocage

| Fait | Preuve |
| --- | --- |
| Conteneur cloud, pas `D:\Sentinel-Fortune-Workspace` | clone de `sentinelfortune/sentinelfortune` |
| `api.cloudflare.com`, `*.workers.dev`, `chatgpt.com`, `api.vercel.com`, `onecompany.sentinelfortune.com` | **refusés** par la politique réseau de l'environnement (`connect_rejected`), revérifié le 2026-10-22 |
| Identifiants Cloudflare dans la session | aucun ; le connecteur Cloudflare est en lecture seule (ni déploiement, ni `secret put`) |
| Connecteur Vercel | ne voit que `orsflow-saas` ; le projet `platform` n'est pas visible |
| Push GitHub | non effectué : impossible d'exclure un déploiement Preview Vercel non maîtrisé (le commit `69eee4d` a été poussé précisément pour en déclencher un) |

## 2. Inventaire des changements (locaux, non poussés)

| Branche | Commits | Base |
| --- | --- | --- |
| `feature/sfl-editorial-activation` | `95ac097`, `d3f24c7` (+ ce rapport) | `ab0c65a` |
| `fix/corridor-owner-gate` | `dfa9d9b`, `d650fee` | `ab0c65a` |

`main` (`05b6d69`) et `feature/public-experience-v2` (`ab0c65a`) sont
intacts, en local comme à distance. Aucun fichier n'a été supprimé.

**Corridor Vercel** (`platform/`) : `api/corridor.js`,
`api/chatgpt-corridor.js`, `editorial/chatgpt-manifests.json`,
`tests/corridor.owner-gate.cjs` (nouveau), `tests/corridor.routing.cjs` (il
approuve désormais via le credential Owner au lieu de forcer APPROVED en SQL).

**Transport et corridor** (`transport/`, `corridor/`) :
- `corridor/core/store.js`, `corridor/actions.js` — état de gouvernance persisté
- `corridor/core/publish.js` — traductions FR publiées dans le feed
- `transport/runtime/store-do.js`, `runtime/worker-live.js` — ledger DO
- `transport/wrangler.toml` — `sfl-editorial-api` utilise désormais le ledger
- `transport/scripts/deploy-test-preview.sh` — correctif `--env=""`, étape KV retirée
- `transport/e2e/runtime-acceptance.mjs` (nouveau)
- tests `store-do`, `day001-draft`
- `LIVE-PERSISTENCE.md`, `MISSION-REPORT-2026-10-21.md`
- `corridor/editorial/drafts/vibraflow-legacy-365-day-001.draft.json`

## 3. Sécurité — défauts trouvés et corrigés

| # | Défaut | Correction | Preuve |
| --- | --- | --- | --- |
| S1 | `da5aef1` : politique de publication ChatGPT **codée en dur par défaut** quand `CORRIDOR_STANDING_POLICY` est absente, vide ou invalide | défaut supprimé | owner-gate : 10 FAIL avant, PASS après |
| S2 | `GET /api/chatgpt-corridor?id=legacy-365-day-001` **publiait Day 001** (create → review → publish sur un GET) | POST uniquement (GET → 405) ; l'adaptateur s'arrête à REVIEW et n'appelle jamais `publish_approved` | owner-gate §6 |
| S3 | republication possible après retrait de la politique qui l'avait autorisée | autorisée seulement si la politique couvre encore l'enregistrement | owner-gate §5 |
| S4 | approbation non liée à la version : `update_draft` sur un enregistrement APPROVED, puis publication sur l'ancienne approbation | une modification renvoie en REVIEW ; la publication exige `approve.detail.version === version`, sinon `APPROVAL_STALE` | owner-gate §7 |
| S5 | `update_draft` permis sur **PUBLISHED** : un assistant pouvait modifier le contenu en ligne | refusé (`NOT_EDITABLE`) | owner-gate §7 |
| S6 | clés d'idempotence globales : la clé d'un principal rejouait la réponse d'un autre | clés rattachées à l'appelant | owner-gate §8 |
| S7 | Worker : approbations Owner, audit Owner et limite de débit **gardés en mémoire** et perdus entre requêtes (approbation inutilisable, audit perdu, limite jamais déclenchée) | déplacés dans le store, persistés par le ledger | store-do : 2 FAIL sur l'ancien corridor, PASS après |
| S8 | Worker KV : 9 brouillons concurrents sur 12 perdus **en répondant 200** | `sfl-editorial-api` basculé sur le ledger Durable Object | contrôle workerd (§5) |
| S9 | feed publié sans `metadata.translations` : le français n'atteignait jamais le lecteur | traductions ajoutées dans la forme lue par le moteur | acceptation workerd §6 |
| S10 | `deploy-test-preview.sh` utilisait `--env=""`, refusé par wrangler 3.114 et 4.20 | retiré | dry-run |

L'adaptateur n'est joignable que sur `*.vercel.app` (404 sur
`onecompany.sentinelfortune.com` et sur les sous-domaines des mondes — testé).
`server/github-oidc.js` n'est toujours pas branché : recommandation, non réalisée.

### Exposition en Production et neutralisation

`da5aef1` n'est pas dans `main`. L'exposition dépend de la branche que
déploie le projet Vercel `platform`, que je ne peux pas voir. La D1 ne
contient aucun enregistrement Day 001 : le GET de publication n'a donc
jamais abouti.

**Neutralisation si `da5aef1` est déployé.** Ces étapes sont à réaliser par
le propriétaire, dans le tableau de bord Vercel du projet `platform` :

1. Retirer `CORRIDOR_TOKEN_CHATGPT` des environnements Production **et**
   Preview, puis Redeploy. Effet : l'adaptateur répond 503 et ChatGPT perd
   tout accès en écriture au corridor (rédaction comprise) jusqu'au
   déploiement du correctif. Claude et l'Owner ne sont pas affectés.
2. Ou : Instant Rollback vers un déploiement antérieur à `da5aef1`. Effet :
   le sélecteur EN/FR (`226f188`) et les changements suivants sont perdus
   jusqu'au redéploiement.
3. Ou déployer `fix/corridor-owner-gate` (votre accord explicite est
   requis). Effet sur l'enregistrement existant
   `edl-vfm-001-the-cost-of-an-unmade-decision` : il reste PUBLISHED. S'il
   est retiré, il demandera une nouvelle approbation, car son approbation
   n'enregistre pas de version (S4, fermé par conception).

## 4. Résultats des tests

| Suite | Résultat |
| --- | --- |
| corridor (`corridor.test.mjs`) | 23/23 |
| transport (`transport.test.mjs`) | 29/29 |
| ledger DO (`store-do.test.mjs`) | 12/12 |
| Day 001 (`day001-draft.test.mjs`) | 7/7 |
| acceptation corridor + live proof transport | PASS / PASS |
| platform owner-gate (`corridor.owner-gate.cjs`) | 23/23 (10 FAIL sur `dfa9d9b` ; 10 FAIL sur `ab0c65a`) |
| platform lifecycle | PASS, sortie identique à l'avant-correction |
| platform routing + sept mondes | PASS (les sept, aucune fuite entre mondes) |
| platform engine + hub | 107/107 |
| build Worker en dry-run (wrangler 4.20.0) | 72,00 KiB / gzip 19,53 KiB, binding `EDITORIAL_LEDGER`, mode `TEST_PREVIEW` (racine et `--env production`) |

## 5. Preuves sur le vrai runtime Workers (workerd, loopback)

Configuration finale `transport/wrangler.toml`, identifiants jetables
détruits après usage. Les sorties sont conservées dans le scratchpad de la
session (`evidence/`).

| Exécution | Résultat |
| --- | --- |
| `validate-remote.mjs`, TEST_PREVIEW | **68 PASS · 0 FAIL · 1 NOT_TESTED** (révocation, seconde passe) |
| `validate-remote.mjs --revoked CLIENT_CHATGPT` | **20 PASS · 0 FAIL** |
| `runtime-acceptance.mjs`, LIVE (local) | **31/31** |
| contrôle : même acceptation sur le Worker KV | **FAIL** — 9 écritures concurrentes sur 12 perdues |

Parcours prouvé en HTTP, une requête par étape : PREPARE ChatGPT → aperçu
EN/FR → refus 401/403 → rejeu → 12 PREPARE concurrents sans perte →
publication refusée avant approbation → approbation Owner → modification →
publication refusée (`APPROVAL_STALE`) → réapprobation → PUBLISHED → feed sur
VibraFlow Media avec le français → retrait refusé sans autorisation →
autorisation Owner → UNPUBLISHED → disparu du feed → rollback en v1 → audit
Owner conservé → aucun jeton ni empreinte dans les réponses.

**Ce que cela ne prouve pas :** le réseau Cloudflare, un Worker déployé, le
stockage des secrets du vrai compte, ni un appel depuis ChatGPT ou Claude.

## 6. Déploiement et endpoint

**Aucun.** Aucun endpoint HTTPS n'existe. Dans le compte, `sfl-editorial-api`
n'existe pas (68 Workers listés le 2026-10-21) et aucune ressource n'a été
créée. L'adresse sera `https://sfl-editorial-api.<sous-domaine>.workers.dev`,
affichée par le script de déploiement.

## 7. Connecteurs ChatGPT et Claude

**Non appelables.** Aucun contrat n'a été généré avec une vraie URL, et aucun
appel n'est venu de l'un ou l'autre client. Le générateur a été vérifié sur
un hôte non routable : le paquet ChatGPT n'expose que `/v1/health`,
`/v1/contract` et `/v1/editorial`, sans route Owner ni secret.

## 8. Identités et autorisations

Implémenté et prouvé sur workerd :
- `CLIENT_CHATGPT`, `CLIENT_CLAUDE` et `OWNER` sont distincts ; le
  credential choisit l'adaptateur ;
- le Worker stocke des empreintes SHA-256, comparées à temps constant ;
  refus par défaut ;
- révocation instantanée (`SFL_CORRIDOR_REVOKED`) et rotation par empreinte ;
- protection anti-rejeu par le ledger d'instructions ;
- la limite de débit est désormais persistante ;
- l'audit Owner est persistant ;
- aucun client ne peut atteindre `/v1/owner/*`.

La signature HMAC existe mais n'est pas activée (pas de
`SFL_CORRIDOR_SIGNING_SECRET`). **Aucun identifiant réel n'a été créé.**

## 9. Persistance

`sfl-editorial-api` repose sur un unique Durable Object `EditorialLedger`
(SQLite) :
- chaque commande s'exécute sous `blockConcurrencyWhile` et s'écrit en une
  seule `storage.transaction` ;
- enregistrements, ledger d'instructions et audit Owner ne sont jamais
  supprimés ;
- une approbation est supprimée quand elle est consommée ;
- une approbation désigne un enregistrement, une version et une action.

La D1 existante `sfl-editorial-corridor` appartient au corridor Vercel. Elle
a été lue seulement et n'est **pas** partagée : deux autorités d'écriture ne
sont pas fusionnées. Migration : aucune (pas d'état antérieur). Restauration :
le DO conserve l'historique des versions de chaque enregistrement, et la route
Owner `rollback` recrée une version antérieure.

## 10. Gouvernance de publication

Les deux corridors exigent désormais une approbation Owner explicite de la
version exacte.
- **Vercel :** une politique permanente n'existe que si l'Owner définit
  `CORRIDOR_STANDING_POLICY`. Aucune n'existe dans le code.
- **Worker :** aucun mécanisme de politique ; chaque publication exige une
  approbation, consommée à l'usage.
- **TEST_PREVIEW :** refuse la publication en amont, même avec une approbation.

## 11. Day 001 — LEGACY 365

| Élément | État |
| --- | --- |
| Texte anglais | complet, texte du propriétaire inchangé (47 paragraphes : méditation, principe, loi spirituelle, invisible → visible, droit, finance, réflexion mystique identifiée comme telle, Legacy Audit, action du jour, prière, clôture) |
| Français | **complet, 47/47**. Quatre passages absents du français fourni ont été traduits par Claude (¶21 EN, seconde phrase du ¶26, ¶36, ¶37) — **en attente de votre relecture** |
| Précautions juridiques et financières | présentes dans le texte (« l'éducation doit rester distincte du conseil juridique personnalisé ») |
| Package visuel | brief, alt EN/FR, tokens VibraFlow, provenance `PENDING_OWNER_ASSET` ; aucune image créée ni importée |
| Manifeste Vercel | `READY_FOR_REVIEW`, indicateur permanent `owner_authorized` retiré |
| État atteint | **en local** : REVIEW (corridor Vercel, POST de l'adaptateur) et DRAFT en attente de l'Owner (transport). **En production : rien** — D1 non modifiée |
| Publication | aucune ; elle exige votre approbation explicite de la version exacte |

## 12. Coûts et quotas

Non vérifiés sur le compte (pas d'accès à la facturation). D'après les
conditions publiées par Cloudflare, un Worker sur `workers.dev` et des
Durable Objects SQLite sont inclus dans l'offre Workers Free. À confirmer
dans le tableau de bord avant déploiement. Rien n'a été acheté ni créé.

## 13. Actions du propriétaire pour terminer (dans l'ordre)

1. **Récupérer les travaux** : les bundles transmis dans cette session, ou
   autoriser le push une fois les builds Vercel et Cloudflare Pages exclus
   pour ces branches (Settings → Git → Ignored Build Step).
   Attention : le bundle `sfl-editorial-activation.bundle` déjà transmis ne
   contient que `95ac097`. Utilisez les bundles `-final` joints à ce rapport,
   qui contiennent aussi `d3f24c7` et `d650fee`.
2. Décider de la neutralisation Vercel (§3).
3. Depuis le ZBook (Git Bash ou WSL, wrangler connecté) :
   `bash transport/scripts/deploy-test-preview.sh`
4. `SFL_API_BASE=https://sfl-editorial-api.<sous-domaine>.workers.dev SFL_CRED_DIR=~/.sfl-editorial node transport/scripts/validate-remote.mjs`,
   puis la passe `--revoked`.
5. `node transport/scripts/make-connector.mjs <URL>`, puis ChatGPT (GPT
   personnalisé → Actions → importer `openapi.chatgpt.json`, API Key / Bearer
   = `CLIENT_CHATGPT`) et Claude (`claude-tools.json`, Bearer =
   `CLIENT_CLAUDE`). Faire un vrai PREPARE depuis chacun.
6. Relire le français de Day 001, le faire préparer par DANI, puis
   l'approuver vous-même si vous le souhaitez.
7. LIVE : `SFL_CORRIDOR_MODE = "LIVE"` puis redéploiement (votre décision),
   ensuite `node transport/e2e/runtime-acceptance.mjs --owner-authorized-publication`
   sur la vraie URL, pour prouver publication → retrait → rollback.

## 14. Risques résiduels

1. Exposition Vercel inconnue tant que le §3 n'est pas tranché.
2. Deux corridors (Vercel/D1 et Worker/DO) avec des identifiants et des
   stores séparés.
3. Signature HMAC non activée.
4. `github-oidc.js` non branché ; il vise un workflow qui n'existe pas.
5. Les traductions françaises de Claude ne sont pas encore relues.
6. Un objet DO unique plafonne le débit (acceptable au volume éditorial).
7. Dans le corridor Vercel, la limite de débit compte par adaptateur depuis
   le journal d'événements, sans transaction entre requêtes concurrentes.

**Non touchés :** Stripe, Shop, House of Assets, QYET, ORsFlow, DNS, les sept
domaines, les Workers existants, `main`, la D1 de production (lecture seule).
