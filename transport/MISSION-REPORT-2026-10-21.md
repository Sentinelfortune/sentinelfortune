# SFL EDITORIAL CORRIDOR — Rapport de mission d'activation (2026-10-21)

**Verdict : BLOCKED** pour le déploiement et les tests distants (blocage précis
ci-dessous) ; **PARTIAL** pour l'ensemble de la mission : tout ce qui ne dépend
pas du réseau est fait, vérifié et documenté.

Aucun Worker déployé. Aucune ressource Cloudflare créée. Aucun secret créé,
stocké ou divulgué. Aucune publication. Aucun push Git.

---

## 1. Environnement d'exécution — fait déterminant

Cette session ne tourne **pas** dans `D:\Sentinel-Fortune-Workspace`. Elle tourne
dans un conteneur cloud éphémère, sur un clone de
`sentinelfortune/sentinelfortune`, branche `feature/public-experience-v2`
(HEAD `ab0c65a`, arbre propre au départ). Le corridor et le transport sont à la
racine (`corridor/`, `transport/`), pas sous `sentinelfortune-preview-v2/`.

| Prérequis | Constat (preuve) |
| --- | --- |
| `api.cloudflare.com` | **refusé** par la politique réseau du conteneur (`connect_rejected`) |
| `*.workers.dev` | **refusé** (`connect_rejected`) |
| `chatgpt.com` | **refusé** (`connect_rejected`) |
| Authentification Wrangler | **absente ici** — aucun identifiant Cloudflare dans le conteneur. L'authentification mentionnée existe sur la machine du propriétaire, pas dans cette session |
| Connecteur Cloudflare (MCP) | lecture Workers/KV/D1 seulement ; **aucune** opération de déploiement ni de `secret put` |
| `registry.npmjs.org` | autorisé (wrangler installé dans le scratchpad pour les builds hors ligne) |

**Blocage précis :** le Worker ne peut être ni déployé ni appelé depuis cette
session. Pour lever : soit exécuter l'activation depuis la machine du
propriétaire (§9), soit autoriser `api.cloudflare.com` et
`*.workers.dev` dans la politique réseau de l'environnement **et** fournir un
jeton API Cloudflare limité (décision du propriétaire — non demandée ici).

## 2. Audit — résultats vérifiés

| Élément | Résultat |
| --- | --- |
| Transport `tests/transport.test.mjs` | **29/29 PASS** |
| Corridor `tests/corridor.test.mjs` | **23/23 PASS** → 52/52 confirmé |
| Corridor acceptance | PASS |
| Transport live proof (socket local) | PASS |
| Build Worker TEST_PREVIEW (`wrangler deploy --dry-run`, wrangler 4.20.0) | **67,62 KiB / gzip 18,24 KiB** — confirmé |
| Mode par défaut dans `wrangler.toml` | `TEST_PREVIEW` (racine **et** `env.production`) |
| Worker `sfl-editorial-api` dans le compte | **absent** (68 Workers listés, nom libre) |
| KV `sfl-editorial*` | **absent** (12 namespaces listés, aucun équivalent) |
| D1 | `sfl-editorial-corridor` existe — utilisée par le corridor **Vercel**, pas par ce Worker |
| Day 001 dans la D1 de production | **absent** (lecture seule : 1 seul enregistrement, `edl-vfm-001-the-cost-of-an-unmade-decision`) |

## 3. Défaut trouvé et corrigé

`transport/scripts/deploy-test-preview.sh` passait `--env=""`. Wrangler 3.114.0
**et** 4.20.0 le rejettent (`No environment found in configuration with name ""`),
donc l'activation s'arrêtait à l'étape 2/6. Correction : sans `--env`, wrangler
cible l'environnement racine (TEST_PREVIEW) ; la production reste accessible
uniquement via `--env production`, que le script ne passe jamais. Même correction
dans `PHASE2-ACTIVATION.md` et l'en-tête de `validate-remote.mjs`.
Vérifié ensuite : le script s'arrête proprement à 1/6 (« not logged in »), ne
crée aucun identifiant et laisse `wrangler.toml` intact.

Note pour le propriétaire : l'étape 5/6 (`secret put`) précède le déploiement ;
sur un Worker inexistant, wrangler peut créer d'abord un Worker vide pour y
attacher le secret. Sans danger (refus par défaut tant qu'aucun empreinte ne
correspond), mais attendez-vous à ce message.

## 4. Persistance

- **TEST_PREVIEW / KV** : inchangé, non validé à distance (bloqué).
- **LIVE / Durable Object** : préparé, **non activé** — `runtime/store-do.js`,
  `runtime/worker-live.js`, `wrangler.live.example.toml`, `LIVE-PERSISTENCE.md`.
  Sérialisation (`blockConcurrencyWhile`, un objet unique) + écriture atomique
  (`storage.transaction`) + refus de toute perte de clé. **10/10 PASS** sur un
  modèle local strict, y compris une expérience de contrôle qui montre la perte
  d'une mise à jour acquittée *sans* la sérialisation. Build dry-run :
  70,17 KiB / gzip 18,98 KiB. *Simulation locale : ne prouve pas le runtime
  Cloudflare.*
- D1 non retenue pour ce Worker : la partager avec le corridor Vercel
  fusionnerait deux chemins d'écriture — décision de gouvernance réservée.

## 5. Tests distants

**Aucun test distant n'a été exécuté. Aucun PASS distant n'est revendiqué.**

Répétition sur loopback (`runtime/node.mjs`, identifiants jetables détruits
ensuite), statut forcé par le script à `LOCAL_REHEARSAL_ONLY` :

| Passe | Résultat |
| --- | --- |
| Complète (santé, contrat, auth, séparation ChatGPT/Claude/Owner, refus Owner/client, idempotence, brouillons, aperçu EN/FR, refus commercial, refus de publication TEST_PREVIEW, flux vide, fuite de secrets, nettoyage) | **68 PASS · 0 FAIL · 1 NOT_TESTED** (révocation) |
| `--revoked CLIENT_CHATGPT` | **20 PASS · 0 FAIL** |
| Recherche des jetons/empreintes dans rapports + journaux serveur | **0 occurrence** |

Anti-rejeu : registre d'instructions (testé) ; la signature HMAC optionnelle
n'est pas activée (`SFL_CORRIDOR_SIGNING_SECRET` absent — le système le déclare).
Isolation des sept mondes : couverte par les tests corridor (`BRANCH_REJECTS_TYPE`)
et la répétition ; non vérifiée à distance.

## 6. Authentification

Trois identités distinctes prévues (`CLIENT_CHATGPT`, `CLIENT_CLAUDE`, `OWNER`),
stockées sous forme d'empreintes SHA-256 dans les secrets Worker, comparaison à
temps constant, refus par défaut. **Aucune n'a été créée** : les créer ici
aurait produit des jetons dans un conteneur éphémère sans Worker pour les
recevoir.

## 7. Connecteur ChatGPT

**Non généré avec une adresse réelle — il n'existe pas d'adresse réelle.**
Générateur vérifié sur un hôte non routable (`.invalid`, sortie supprimée) :
le paquet ChatGPT expose uniquement `/v1/health`, `/v1/contract`,
`/v1/editorial` ; aucune route Owner. Le paquet Claude ne mentionne `/v1/owner/*`
que dans une règle textuelle (« inaccessible au credential Claude »), jamais
comme opération. **Le connecteur n'est pas callable** : aucun appel ChatGPT n'a eu lieu.

## 8. Premier actif éditorial — Day 001 (BROUILLON uniquement)

`corridor/editorial/drafts/vibraflow-legacy-365-day-001.draft.json` :
texte anglais et traduction française **copiés à l'identique** du manifeste
existant (vérifié octet pour octet), statut `DRAFT_ONLY`, `publicationAuthorized:false`,
`FREE`, sans CTA ni média ; package visuel en `PENDING_OWNER_ASSET` (brief,
alt EN/FR, accent VibraFlow `#d8c9a8`, repli `PREMIUM_FALLBACK`).
`tests/day001-draft.test.mjs` : **5/5 PASS** localement — PREPARE par ChatGPT →
`DRAFT`, `isLive:false`, VibraFlow ; aperçu EN + FR ; publication refusée même
après approbation Owner (`PUBLICATION_DISABLED`) ; idempotent.

**Écart de parité :** FR = 44 paragraphes, EN = 47. Trois passages anglais sont
absents du français. Conservé tel quel, signalé pour relecture éditoriale.

## 9. Interventions requises du propriétaire

1. **Récupérer ces changements** (commit local dans le conteneur, non poussé —
   voir §11).
2. Depuis `D:\Sentinel-Fortune-Workspace` (Git Bash ou WSL, wrangler connecté) :
   `bash transport/scripts/deploy-test-preview.sh`
3. `SFL_API_BASE=https://sfl-editorial-api.<sous-domaine>.workers.dev SFL_CRED_DIR=~/.sfl-editorial node transport/scripts/validate-remote.mjs` — puis la passe `--revoked` (PHASE2-ACTIVATION.md §2).
4. `node transport/scripts/make-connector.mjs https://sfl-editorial-api.<sous-domaine>.workers.dev`
5. **ChatGPT** (GPT personnalisé → Configurer → Actions → Créer une action) :
   importer `transport/contracts/generated/openapi.chatgpt.json` ;
   Authentification : *API Key*, type *Bearer*, valeur = jeton `CLIENT_CHATGPT`.
   Faire un appel réel : « Prépare Day 001 en brouillon » avec le corps
   `prepareRequest` du paquet → attendre `state: DRAFT`, `isLive: false`.
   Ce n'est qu'alors que le connecteur peut être déclaré callable.
6. Supprimer les fichiers `.token` une fois collés.
7. Relire la traduction française de Day 001 (§8).
8. Trancher les risques §10.1 et §10.2.

## 10. Risques restants

1. **CRITIQUE — publication LIVE sans approbation Owner explicite, hors de ce
   corridor.** Le commit `da5aef1` ajoute dans `platform/api/corridor.js` une
   politique permanente codée en dur (`OWNER_AUTHORIZED_CHATGPT_POLICY`)
   appliquée **par défaut** quand `CORRIDOR_STANDING_POLICY` est absente :
   ChatGPT peut publier dans les sept mondes sans approbation Owner. Et
   `platform/api/chatgpt-corridor.js` enchaîne `create_draft → submit_review →
   publish_approved` sur un simple `GET ?id=legacy-365-day-001` depuis tout
   hôte `*.vercel.app` ; le manifeste Day 001 est `READY_TO_PUBLISH`,
   `owner_authorized: true`. Seule la protection Vercel Authentication
   s'interpose : `platform/server/github-oidc.js` (commit `ab0c65a`) **n'est
   importé nulle part**. Cela contredit « aucune publication LIVE » et le
   principe d'approbation Owner. **Non modifié** (code de production, hors
   périmètre) — décision du propriétaire requise.
2. **Deux corridors d'écriture** (Worker `transport/` + Vercel `platform/api/`)
   avec des identifiants, une persistance et des règles d'approbation
   différents. À unifier ou à cloisonner explicitement avant LIVE.
3. KV sans compare-and-set en TEST_PREVIEW (accepté et documenté).
4. Signature HMAC anti-rejeu non activée.
5. Ledger DO validé seulement en simulation locale.
6. Coûts : non vérifiés sur le compte (pas d'accès facturation). Selon l'offre
   gratuite publiée par Cloudflare, un Worker + un namespace KV (+ un DO
   SQLite plus tard) sur `workers.dev` relèvent de l'offre gratuite ; à
   confirmer dans le tableau de bord avant le déploiement.

## 11. Modifications locales (non poussées)

| Fichier | Nature |
| --- | --- |
| `transport/scripts/deploy-test-preview.sh` | correctif `--env=""` |
| `transport/PHASE2-ACTIVATION.md`, `transport/scripts/validate-remote.mjs` | même correctif (documentation) |
| `transport/package.json` | scripts `test:ledger`, `test:day001` (ajout) |
| `transport/runtime/store-do.js`, `runtime/worker-live.js` | nouveaux, inactifs |
| `transport/wrangler.live.example.toml` | nouveau, exemple, jamais lu par défaut |
| `transport/tests/store-do.test.mjs`, `tests/day001-draft.test.mjs` | nouveaux |
| `transport/LIVE-PERSISTENCE.md`, ce rapport | nouveaux |
| `corridor/editorial/drafts/vibraflow-legacy-365-day-001.draft.json` | nouveau |

Aucun fichier supprimé. `wrangler.toml`, le corridor, `core/` et `platform/`
sont inchangés. Un effet de bord de `corridor/e2e/acceptance.mjs`
(horodatages réécrits dans `corridor/editorial/public-feed.json`) a été annulé.

**Rien d'autre n'a été touché :** Stripe, Shop, House of Assets, QYET, ORsFlow,
DNS, les sept domaines publics, Workers existants, D1 (lecture seule).
