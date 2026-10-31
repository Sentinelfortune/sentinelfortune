/* Sentinel Fortune — PUBLIC EXPERIENCE V2 unit tests.
 *
 * These guard the things the browser run cannot: the readiness contract, the
 * selection gate the homepage uses, the media-role system, and the invariant
 * that the homepage can never manufacture a purchase or a payment.
 *
 *   node --test platform/tests/hub.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { selectAllPublic, selectPublic, IDENTITIES } from "../engine/core.js";
import {
  BRANCHES, HUB, WORLD_ORDER, orderedBranches, worldState, STATE_LABEL, allBranches,
} from "../engine/identities.js";
import { worldHref, SUPPORT_AMOUNTS } from "../engine/hub.js";
import { MEDIA_ROLES, governedRole, governedRoles } from "../engine/visual.js";
import { isPublicHost, isCanonicalHost, HUB_PUBLIC_HOSTS } from "../engine/router.js";
import { priceState, ctaState } from "../engine/commerce.js";

const FEED = JSON.parse(readFileSync(new URL("./preview-fixture.json", import.meta.url), "utf8"));

/* ═══ ONE ENGINE, SEVEN WORLDS ════════════════════════════════════════ */

test("there are exactly seven worlds, and they match the engine's identities", () => {
  assert.equal(Object.keys(BRANCHES).length, 7);
  assert.equal(WORLD_ORDER.length, 7);
  assert.equal(new Set(WORLD_ORDER).size, 7);
  assert.deepEqual([...WORLD_ORDER].sort(), [...IDENTITIES].sort());
  assert.deepEqual(orderedBranches().map((b) => b.slug), [...WORLD_ORDER]);
});

test("the homepage is not an eighth world", () => {
  assert.ok(!IDENTITIES.includes(HUB.slug));
  assert.ok(!Object.keys(BRANCHES).includes(HUB.slug));
  /* But it carries the same shell anatomy, so the shell needs no fork. */
  for (const key of ["name", "tag", "mark", "job", "nav", "theme"]) assert.ok(key in HUB, key);
});

test("every world declares the public presentation the homepage needs", () => {
  for (const b of allBranches()) {
    assert.ok(b.role && b.role.length > 10, `${b.slug} role`);
    assert.ok(b.cta && b.cta.length > 2, `${b.slug} cta`);
    assert.ok(Array.isArray(b.focus) && b.focus.length >= 3, `${b.slug} focus`);
    assert.ok(b.readiness && typeof b.readiness.experienceReady === "boolean", `${b.slug} readiness`);
  }
});

/* ═══ THE BRAND FOUNDATION IS DEEP BLUE ═══════════════════════════════ */

test("every field in the family is blue-dominant — not black, not black-and-gold", () => {
  const fields = [["hub", HUB.theme.bg], ...allBranches().map((b) => [b.slug, b.theme.bg])];
  for (const [name, hex] of fields) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    assert.ok(b > r && b > g, `${name} ${hex} is not blue-dominant`);
    /* And the blue must be PRESENT, not a rounding error above near-black. */
    assert.ok(b >= 0x18, `${name} ${hex} blue channel ${b} is too dark to read as blue`);
  }
});

test("the homepage accent is not gold — gold is a separate, scarce token", () => {
  assert.notEqual(HUB.theme.accent.toLowerCase(), "#c8a84b");
  const r = parseInt(HUB.theme.accent.slice(1, 3), 16);
  const b = parseInt(HUB.theme.accent.slice(5, 7), 16);
  assert.ok(b > r, `the company accent ${HUB.theme.accent} should be luminous blue`);
  assert.equal(HUB.theme.gold, "#c8a84b");
});

/* ═══ THE READINESS CONTRACT ══════════════════════════════════════════ */

test("worldState implements the strict nesting, and ignores a flag raised out of order", () => {
  const mk = (experienceReady, hubVisible, subdomainLive) => ({ readiness: { experienceReady, hubVisible, subdomainLive } });

  assert.equal(worldState(mk(false, false, false)), "BUILD");
  assert.equal(worldState(mk(true, false, false)), "READY");
  assert.equal(worldState(mk(true, true, false)), "HUB");
  assert.equal(worldState(mk(true, true, true)), "LIVE");

  /* Out of order: each is IGNORED rather than obeyed. */
  assert.equal(worldState(mk(false, true, true)), "BUILD", "hubVisible without experienceReady must not promote");
  assert.equal(worldState(mk(true, false, true)), "READY", "subdomainLive without hubVisible must not promote");
  assert.equal(worldState(mk(false, false, true)), "BUILD");
  assert.equal(worldState({}), "BUILD");
  assert.equal(worldState(null), "BUILD");

  for (const s of Object.keys(STATE_LABEL)) assert.ok(STATE_LABEL[s].length > 2);
});

test("the platform's readiness matches the institutional site's _data/identities.yml", () => {
  /* The institutional site is the source of truth. The platform is a static
     runtime and cannot read YAML, so it mirrors it — and THIS TEST is what
     makes the mirror safe. If the two disagree, this fails rather than the
     homepage quietly linking to something the Owner has not surfaced. */
  const yaml = readFileSync(new URL("../../_data/identities.yml", import.meta.url), "utf8");

  const fromYaml = {};
  let slug = null;
  for (const line of yaml.split("\n")) {
    const s = line.match(/^-\s+slug:\s*"?([a-z0-9-]+)"?\s*$/);
    if (s) { slug = s[1]; fromYaml[slug] = {}; continue; }
    if (!slug) continue;
    const f = line.match(/^\s{4}(experienceReady|hubVisible|subdomainLive):\s*(true|false)\s*$/);
    if (f) fromYaml[slug][f[1]] = f[2] === "true";
  }

  assert.equal(Object.keys(fromYaml).length, 7, "expected seven identities in the YAML");

  for (const b of allBranches()) {
    const y = fromYaml[b.slug];
    assert.ok(y, `${b.slug} missing from _data/identities.yml`);
    for (const flag of ["experienceReady", "hubVisible", "subdomainLive"]) {
      assert.equal(
        b.readiness[flag], y[flag],
        `${b.slug}.${flag}: platform says ${b.readiness[flag]}, _data/identities.yml says ${y[flag]}`,
      );
    }
  }
});

test("on the Owner's current data a world is publicly linked ONLY when it is LIVE", () => {
  /* This replaced an assertion that NO world may be linked, which was a
     snapshot of the Owner's data rather than a rule — it had to fail the first
     time a world was legitimately published, which tells you nothing. The rule
     is what matters, and it holds whatever the flags say: a world is reachable
     from a public Hub exactly when its own readiness reached LIVE, and the
     destination is then its canonical hostname, never an internal route. */
  const linked = [];
  for (const b of allBranches()) {
    const state = worldState(b);
    const href = worldHref(b, state, { preview: false });
    if (state === "LIVE") {
      assert.equal(href, `https://${b.host}/`, `${b.slug} is LIVE and must link to its canonical hostname`);
      linked.push(b.slug);
    } else {
      assert.equal(href, null, `${b.slug} must not be publicly linked while ${state}`);
    }
  }
  /* Whatever is linked today, it is a strict subset of what passed validation.
     A world cannot appear here on a raised flag alone. */
  for (const slug of linked) {
    assert.equal(BRANCHES[slug].readiness.experienceReady, true, `${slug} is linked without experienceReady`);
  }
});

test("a world becomes linkable only when the Owner surfaces it, and never to a dead subdomain", () => {
  const cfg = { ...BRANCHES.lumenschoolacademy, readiness: { experienceReady: true, hubVisible: true, subdomainLive: false } };
  assert.equal(worldHref(cfg, worldState(cfg), { preview: false }), "/i/lumenschoolacademy/");

  const live = { ...cfg, readiness: { ...cfg.readiness, subdomainLive: true } };
  assert.equal(worldHref(live, worldState(live), { preview: false }), `https://${cfg.host}/`);

  /* READY is deliberately NOT linkable: built and validated is not published. */
  const ready = { ...cfg, readiness: { experienceReady: true, hubVisible: false, subdomainLive: false } };
  assert.equal(worldHref(ready, worldState(ready), { preview: false }), null);
  assert.equal(worldHref(ready, worldState(ready), { preview: true }), "/i/lumenschoolacademy/");
});

test("the homepage's own hosts are public, and a preview host is not", () => {
  for (const host of HUB_PUBLIC_HOSTS) assert.equal(isPublicHost(host), true, host);
  assert.equal(isPublicHost("lumengame.sentinelfortune.com"), true);
  assert.equal(isPublicHost("127.0.0.1"), false);
  assert.equal(isPublicHost("sfl-preview.vercel.app"), false);
  assert.equal(isPublicHost(""), false);
  /* sentinelfortune.com is the COMPANY, not one of the seven worlds. */
  assert.equal(isCanonicalHost("sentinelfortune.com"), false);
});

/* ═══ THE SELECTION GATE ══════════════════════════════════════════════ */

test("selectAllPublic uses the same readiness gate as selectPublic", () => {
  const all = selectAllPublic(FEED.records);

  /* Union of the seven per-world selections equals the homepage's selection. */
  const union = IDENTITIES.flatMap((id) => selectPublic(FEED.records, id).accepted.map((r) => r.id));
  assert.deepEqual([...all.accepted.map((r) => r.id)].sort(), [...union].sort());

  /* Every world is a key, including ones with nothing published. */
  assert.deepEqual(Object.keys(all.byIdentity).sort(), [...IDENTITIES].sort());
  for (const id of IDENTITIES) assert.ok(Array.isArray(all.byIdentity[id]));

  /* A record for an identity that is not one of the seven never lands. */
  assert.ok(FEED.records.some((r) => r.identity === "sentinelfortunemystery"), "fixture should carry the negative case");
  assert.ok(!all.accepted.some((r) => r.identity === "sentinelfortunemystery"));
  assert.ok(all.rejected.some((r) => r.reason === "NOT_PUBLIC"));
});

test("a withheld or unapproved record never reaches the homepage", () => {
  const { accepted } = selectAllPublic(FEED.records);
  const slugs = accepted.map((r) => r.slug);
  for (const hidden of ["not-approved-yet", "string-approval", "withdrawn", "unknown-house"]) {
    assert.ok(!slugs.includes(hidden), `${hidden} must not be public`);
  }
});

/* ═══ THE THREE PUBLICATION ROLES ═════════════════════════════════════ */

test("the three media roles exist and are resolved, not guessed", () => {
  assert.deepEqual([...MEDIA_ROLES], ["ATTENTION", "VALUE", "DISCOVERY"]);

  const { accepted } = selectAllPublic(FEED.records);
  const record = accepted.find((r) => r.slug === "the-discipline-of-an-unhurried-morning");
  assert.ok(record, "the V2 preview record should be published");

  /* No governed imagery yet, so no role claims real imagery — and the page
     says so by generating, not by emitting a path to a file that is not there. */
  assert.deepEqual(governedRoles(record), []);
  for (const role of MEDIA_ROLES) assert.equal(governedRole(record, role), null);
});

test("an unknown media role is dropped rather than carried", () => {
  const { accepted } = selectAllPublic([{
    ...FEED.records.find((r) => r.slug === "origin-echo"),
    media: [{ kind: "IMAGE", role: "SOMETHING_ELSE", src: "/x.png", alt: "x" }],
  }]);
  assert.equal(accepted[0].media[0].role, null);
});

/* ═══ COMMERCE: THE HOMEPAGE CANNOT MANUFACTURE A SALE ════════════════ */

test("only a record with a governed price AND a governed BUY action is sellable", () => {
  const { accepted } = selectAllPublic(FEED.records);

  const sellable = accepted.filter((r) => {
    const money = priceState(r);
    const action = ctaState(r);
    return money.state === "PAID" && action.enabled === true && action.kind === "BUY";
  });

  assert.ok(sellable.length > 0, "the fixture should carry at least one real product");
  for (const r of sellable) {
    assert.match(priceState(r).label, /^\$\d/);
    /* Checkout always leaves for the Shop. The homepage never hosts one. */
    assert.match(ctaState(r).href, /^https:\/\/sentinelfortune\.github\.io\/sentinelfortune\/shop\//);
  }

  /* An UNPRICED record is never sellable — absence of a price is not free. */
  const unpriced = accepted.find((r) => priceState(r).state === "UNPRICED");
  if (unpriced) assert.notEqual(ctaState(unpriced).enabled && ctaState(unpriced).kind, "BUY");
});

test("support is voluntary, bounded, and carries no payment by default", () => {
  assert.deepEqual([...SUPPORT_AMOUNTS], [5, 10, 25]);
  /* There is no default endpoint anywhere in the module — a payment action
     cannot appear because someone forgot to configure one. */
  const source = readFileSync(new URL("../engine/hub.js", import.meta.url), "utf8");
  assert.ok(!/https:\/\/[^"'\s]*(donate|support|pay|checkout|stripe)/i.test(source),
    "hub.js must not contain a hardcoded payment destination");
  assert.ok(/support\.enabled === true/.test(source), "support must be explicitly enabled to render an action");
  assert.ok(source.includes("buy\\.stripe\\.com"), "support validation must require Stripe checkout URLs");
});

test("the homepage defines no price, tier or checkout of its own", () => {
  const source = readFileSync(new URL("../engine/hub.js", import.meta.url), "utf8");
  for (const forbidden of ["FREE / PRO", "PRO / PREMIUM", "pricingTier:", "function priceState", "function ctaState"]) {
    assert.ok(!source.includes(forbidden), `hub.js must not contain ${forbidden}`);
  }
  /* It must USE the one commercial heart rather than reimplement it. */
  assert.ok(source.includes('from "./commerce.js"'));
});

/* ═══ SEO ═════════════════════════════════════════════════════════════ */

test("the company homepage declares its own canonical host and share image", () => {
  /* Without a host, seo.js builds the WebSite node from `branch.host` and
     emits a literal "https://undefined/" — which it did until this existed. */
  /* onecompany, NOT the apex. The apex is the institutional site; the Hub is
     the discovery gateway. Two surfaces claiming one canonical would put the
     gateway in the index competing with the company's authority page. */
  assert.equal(HUB.host, "onecompany.sentinelfortune.com");
  assert.notEqual(HUB.host, "sentinelfortune.com", "the Hub must not claim the institutional canonical");
  assert.ok(HUB.shareImage.startsWith("/assets/"), HUB.shareImage);
  /* JPEG, not WebP: several social crawlers still refuse WebP. */
  assert.match(HUB.shareImage, /\.jpg$/);
});

test("no branch can produce an undefined host in a canonical or JSON-LD", () => {
  for (const cfg of [HUB, ...allBranches()]) {
    assert.ok(typeof cfg.host === "string" && cfg.host.length > 3, `${cfg.slug} has no host`);
    assert.ok(!/undefined/.test(`https://${cfg.host}/`), `${cfg.slug} host is undefined`);
    assert.match(cfg.host, /^[a-z0-9.-]+\.[a-z]{2,}$/, `${cfg.slug} host is not a hostname`);
  }
});

test("robots.txt disallows everything while the feed is a preview", () => {
  const robots = readFileSync(new URL("../robots.txt", import.meta.url), "utf8");
  assert.match(robots, /User-agent:\s*\*/);
  assert.match(robots, /Disallow:\s*\//);
  /* The feed that ships today is a preview, so the coarse signal must agree
     with the per-page directive rather than contradict it. */
  assert.notEqual(FEED.evidence, "LIVE");
});

test("a preview feed is never indexable", () => {
  /* The rule lives in seo.js; this asserts the rule exists, so that making a
     page indexable can never be a one-character edit nobody notices. */
  const seo = readFileSync(new URL("../engine/seo.js", import.meta.url), "utf8");
  assert.ok(seo.includes('evidence === "LIVE" ? "index,follow'), "indexability must be gated on LIVE evidence");
  assert.ok(seo.includes("noindex,nofollow"));
});
