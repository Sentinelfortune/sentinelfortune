/* Unit tests — shared core, commercial heart, identity router, feed envelope.
 *
 * Run: node --test platform/tests/engine.test.mjs
 *
 * Everything here runs without a browser and without a network. The assertions
 * are hand-worked expectations, not whatever the code happened to return.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  IDENTITIES, TYPES, isIdentity, publicReadiness, governedPrice, governedCompareAt,
  governedDestination, normalize, selectPublic,
} from "../engine/core.js";
import {
  priceState, ctaState, showsPrice, formatMoney, relatedTo, bundlesContaining,
  featured, byType, categoryIndex, collectionIndex, splitByCost, search,
} from "../engine/commerce.js";
import { resolveIdentity, resolveView, links, canonicalUrl, isCanonicalHost, canonicalHosts } from "../engine/router.js";
import { readEnvelope, loadFeed, FEED_SCHEMA, DEFAULT_FEED_URL, STATIC_FEED_URL } from "../engine/feed.js";
import { BRANCHES, HOST_MAP, allBranches } from "../engine/identities.js";
import { rendererFor, rendererName } from "../engine/renderers.js";

const FEED = JSON.parse(readFileSync(new URL("../feed/public-site.json", import.meta.url), "utf8"));

/** A minimal valid public record, for building variations on. */
function rec(over = {}) {
  return {
    id: "x1", slug: "a-thing", identity: "lumenschoolacademy", type: "COURSE",
    title: "A Thing", summary: "s", description: "d", media: [],
    publicationStatus: "PUBLIC_SITE", publicReadiness: { approved: true, withheld: false },
    ...over,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   SHARED CORE — governance
   ═══════════════════════════════════════════════════════════════════════ */

describe("core — the seven identities are a closed set", () => {
  test("exactly seven, and the branch config agrees", () => {
    assert.equal(IDENTITIES.length, 7);
    assert.deepEqual([...IDENTITIES].sort(), Object.keys(BRANCHES).sort());
    assert.equal(allBranches().length, 7);
  });

  test("an unknown identity is not an identity", () => {
    assert.equal(isIdentity("lumenschoolacademy"), true);
    assert.equal(isIdentity("sentinelfortunemystery"), false);
    assert.equal(isIdentity(""), false);
    assert.equal(isIdentity(undefined), false);
  });

  test("every branch host maps back to its own slug", () => {
    for (const b of allBranches()) assert.equal(HOST_MAP[b.host], b.slug);
    assert.equal(Object.keys(HOST_MAP).length, 7);
  });
});

describe("core — public readiness", () => {
  test("a complete record is public", () => {
    assert.equal(publicReadiness(rec()).public, true);
  });

  test("DRAFT is never public", () => {
    const r = publicReadiness(rec({ publicationStatus: "DRAFT" }));
    assert.equal(r.public, false);
    assert.match(r.problems.join(" "), /publicationStatus/);
  });

  test("approved must be boolean true — a truthy string is refused", () => {
    for (const truthy of ["yes", 1, "true", {}]) {
      const r = publicReadiness(rec({ publicReadiness: { approved: truthy } }));
      assert.equal(r.public, false, `approved=${JSON.stringify(truthy)} must be refused`);
      assert.match(r.problems.join(" "), /approved is not boolean true/);
    }
  });

  test("withheld beats an earlier approval", () => {
    const r = publicReadiness(rec({ publicReadiness: { approved: true, withheld: true } }));
    assert.equal(r.public, false);
    assert.match(r.problems.join(" "), /withheld/);
  });

  test("an unknown type has no renderer and so is not public", () => {
    const r = publicReadiness(rec({ type: "HOLOGRAM" }));
    assert.equal(r.public, false);
    assert.match(r.problems.join(" "), /no renderer/);
  });

  test("a missing readiness block is refused, not assumed", () => {
    assert.equal(publicReadiness(rec({ publicReadiness: undefined })).public, false);
  });
});

describe("core — pricing authority", () => {
  test("a governed USD price converts to exact cents", () => {
    assert.deepEqual(governedPrice(rec({ price: { amount: 224, currency: "USD" } })), { amount: 224, currency: "USD", cents: 22400 });
    assert.deepEqual(governedPrice(rec({ price: { amount: 49.5, currency: "USD" } })), { amount: 49.5, currency: "USD", cents: 4950 });
  });

  test("an amount with no exact cents form is refused, never rounded", () => {
    assert.equal(governedPrice(rec({ price: { amount: 224.999, currency: "USD" } })), null);
  });

  test("no price means no price — there is no default", () => {
    assert.equal(governedPrice(rec()), null);
    assert.equal(governedPrice(rec({ price: null })), null);
    assert.equal(governedPrice(rec({ price: { amount: "224", currency: "USD" } })), null);
  });

  test("a non-USD currency is refused because the storefront cannot format it", () => {
    assert.equal(governedPrice(rec({ price: { amount: 10, currency: "EUR" } })), null);
  });

  test("a compare-at price must be strictly higher to count", () => {
    const base = { price: { amount: 49, currency: "USD" } };
    assert.deepEqual(governedCompareAt(rec({ ...base, compareAtPrice: { amount: 79, currency: "USD" } })), { amount: 79, currency: "USD" });
    assert.equal(governedCompareAt(rec({ ...base, compareAtPrice: { amount: 49, currency: "USD" } })), null, "equal is not a saving");
    assert.equal(governedCompareAt(rec({ ...base, compareAtPrice: { amount: 20, currency: "USD" } })), null, "lower is not a saving");
  });
});

describe("core — destinations never leak a non-public address", () => {
  test("site-relative paths are allowed", () => {
    assert.deepEqual(governedDestination("/learn/floor"), { href: "/learn/floor", external: false });
  });

  test("an allowed https host is allowed", () => {
    const d = governedDestination("https://sentinelfortune.github.io/sentinelfortune/apps/floor/");
    assert.ok(d);
    assert.equal(d.external, true);
  });

  test("localhost in any form is refused", () => {
    for (const bad of [
      "http://127.0.0.1:8899/play",
      "http://localhost:8899/play",
      "https://localhost/play",
      "https://127.0.0.1/play",
    ]) assert.equal(governedDestination(bad), null, `${bad} must be refused`);
  });

  test("http and foreign hosts are refused", () => {
    assert.equal(governedDestination("http://sentinelfortune.com/x"), null, "http is refused");
    assert.equal(governedDestination("https://evil.example.com/x"), null);
    assert.equal(governedDestination("//evil.example.com/x"), null, "protocol-relative is refused");
    assert.equal(governedDestination("javascript:alert(1)"), null);
  });
});

describe("core — normalization", () => {
  test("a CTA with a refused destination is dropped whole", () => {
    const n = normalize(rec({ cta: { kind: "OPEN", destination: "http://127.0.0.1:8899/x" } }));
    assert.equal(n.cta, null, "half a CTA is worse than none");
  });

  test("an unknown CTA kind is dropped", () => {
    assert.equal(normalize(rec({ cta: { kind: "TELEPORT", destination: "/x" } })).cta, null);
  });

  test("unknown fields do not survive normalization", () => {
    const n = normalize(rec({ sneaky: "<script>", adminToken: "secret" }));
    assert.equal(n.sneaky, undefined);
    assert.equal(n.adminToken, undefined);
  });

  test("the normalized record is frozen", () => {
    const n = normalize(rec());
    assert.throws(() => { "use strict"; n.title = "changed"; });
  });
});

describe("core — selectPublic is the one gate", () => {
  const pool = [
    rec({ id: "a", identity: "lumenschoolacademy" }),
    rec({ id: "b", identity: "lumengame", type: "GAME" }),
    rec({ id: "c", identity: "lumenschoolacademy", publicationStatus: "DRAFT" }),
    rec({ id: "d", identity: "nope" }),
  ];

  test("only this identity's public records come back", () => {
    const { accepted } = selectPublic(pool, "lumenschoolacademy");
    assert.deepEqual(accepted.map((r) => r.id), ["a"]);
  });

  test("another house's record is recorded as hidden, not silently lost", () => {
    const { rejected } = selectPublic(pool, "lumenschoolacademy");
    const other = rejected.filter((r) => r.reason === "OTHER_IDENTITY");
    assert.equal(other.length, 1);
    assert.equal(other[0].identity, "lumengame");
  });

  test("no cross-identity leakage for any of the seven", () => {
    for (const id of IDENTITIES) {
      const { accepted } = selectPublic(FEED.records, id);
      for (const r of accepted) assert.equal(r.identity, id, `${id} received a record owned by ${r.identity}`);
    }
  });

  test("an unknown identity throws rather than returning everything", () => {
    assert.throws(() => selectPublic(pool, "mystery"), /unknown identity/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   SHARED COMMERCIAL HEART
   ═══════════════════════════════════════════════════════════════════════ */

describe("commerce — price state has three values, not two", () => {
  test("FREE requires the governed tier, never the absence of a price", () => {
    assert.equal(priceState(normalize(rec({ pricingTier: "FREE" }))).state, "FREE");
    assert.equal(priceState(normalize(rec())).state, "UNPRICED", "no price must NOT read as free");
  });

  test("PAID carries the formatted governed amount", () => {
    const s = priceState(normalize(rec({ pricingTier: "PAID", price: { amount: 49, currency: "USD" } })));
    assert.equal(s.state, "PAID");
    assert.equal(s.label, "$49");
  });

  test("money formats without pointless cents", () => {
    assert.equal(formatMoney(224, "USD"), "$224");
    assert.equal(formatMoney(49.5, "USD"), "$49.50");
  });
});

describe("commerce — the CTA cannot be dishonest", () => {
  test("a BUY with no governed price is DISABLED and says why", () => {
    const c = ctaState(normalize(rec({ cta: { kind: "BUY", destination: "https://sentinelfortune.github.io/sentinelfortune/shop/" } })));
    assert.equal(c.enabled, false);
    assert.equal(c.kind, "BUY");
    assert.match(c.note, /[Pp]rice not published/);
    assert.equal(c.href, null, "a disabled buy must not carry a link");
  });

  test("a BUY with a price is enabled and shows the price in the label", () => {
    const c = ctaState(normalize(rec({
      pricingTier: "PAID", price: { amount: 49, currency: "USD" },
      cta: { kind: "BUY", destination: "https://sentinelfortune.github.io/sentinelfortune/shop/" },
    })));
    assert.equal(c.enabled, true);
    assert.match(c.label, /\$49/);
  });

  test("no CTA at all yields a readable note, never a dead button", () => {
    const c = ctaState(normalize(rec()));
    assert.equal(c.enabled, false);
    assert.equal(c.href, null);
    assert.ok(c.note.length > 0);
  });

  test("a free action with no price shows no price at all", () => {
    const r = normalize(rec({ cta: { kind: "OPEN", destination: "/x" } }));
    assert.equal(showsPrice(r), false, "nothing to say beats a placeholder");
  });
});

describe("commerce — related offers never cross identities", () => {
  const pool = [
    normalize(rec({ id: "1", slug: "a", collections: ["Ops"], categories: ["X"] })),
    normalize(rec({ id: "2", slug: "b", collections: ["Ops"] })),
    normalize(rec({ id: "3", slug: "c", categories: ["X"] })),
    /* No shared collection, no shared category, and a DIFFERENT type — the
       only genuinely unrelated shape. A same-type record with no overlap is
       still a real (weak) signal and is deliberately allowed to score. */
    normalize(rec({ id: "4", slug: "d", type: "GAME" })),
  ];

  test("shared collection outranks shared category", () => {
    const out = relatedTo(pool[0], pool, 3);
    assert.equal(out[0].slug, "b");
  });

  test("a record is never related to itself", () => {
    assert.equal(relatedTo(pool[0], pool).some((r) => r.id === "1"), false);
  });

  test("a record with no signal at all is excluded, not padded in", () => {
    assert.equal(relatedTo(pool[0], pool, 3).some((r) => r.slug === "d"), false);
  });

  test("same type alone is a real signal and does score", () => {
    const sameType = normalize(rec({ id: "5", slug: "e" }));   // COURSE, no overlap
    assert.equal(relatedTo(pool[0], [sameType]).some((r) => r.slug === "e"), true);
  });

  test("bundle membership resolves only against published bundles", () => {
    const item = normalize(rec({ id: "i", slug: "item", bundleMembership: ["kit"] }));
    const bundle = normalize(rec({ id: "k", slug: "kit", type: "BUNDLE" }));
    assert.deepEqual(bundlesContaining(item, [bundle]).map((b) => b.slug), ["kit"]);
    assert.deepEqual(bundlesContaining(item, []).map((b) => b.slug), [], "a bundle that is not published is not claimed");
  });
});

describe("commerce — browse surfaces", () => {
  const pool = [
    normalize(rec({ id: "1", slug: "a", featured: true, pricingTier: "FREE", categories: ["X"], collections: ["C"] })),
    normalize(rec({ id: "2", slug: "b", pricingTier: "PAID", price: { amount: 10, currency: "USD" }, categories: ["X"] })),
    normalize(rec({ id: "3", slug: "c", type: "SOFTWARE" })),
  ];

  test("featured returns only featured, deterministically", () => {
    assert.deepEqual(featured(pool).map((r) => r.slug), ["a"]);
  });

  test("byType filters and sorts", () => {
    assert.deepEqual(byType(pool, "SOFTWARE").map((r) => r.slug), ["c"]);
  });

  test("categories and collections are derived from records, so none is empty", () => {
    assert.deepEqual(categoryIndex(pool), [{ name: "X", count: 2 }]);
    assert.deepEqual(collectionIndex(pool), [{ name: "C", count: 1 }]);
  });

  test("free and paid split; an unpriced record is in neither", () => {
    const { free, paid } = splitByCost(pool);
    assert.deepEqual(free.map((r) => r.slug), ["a"]);
    assert.deepEqual(paid.map((r) => r.slug), ["b"]);
  });

  test("search covers the fields a visitor can see", () => {
    assert.equal(search(pool, "A Thing").length, 3);
    assert.equal(search(pool, "zzz").length, 0);
    assert.equal(search(pool, "").length, 3);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   IDENTITY ROUTER
   ═══════════════════════════════════════════════════════════════════════ */

describe("router — hostname resolves the identity", () => {
  test("each of the seven canonical hosts resolves to its own house", () => {
    for (const b of allBranches()) {
      const r = resolveIdentity({ hostname: b.host, pathname: "/" });
      assert.equal(r.identity, b.slug);
      assert.equal(r.source, "HOSTNAME");
    }
  });

  test("a port and uppercase do not break resolution", () => {
    assert.equal(resolveIdentity({ hostname: "LumenGame.SentinelFortune.com:443" }).identity, "lumengame");
  });

  test("hostname BEATS the dev overrides — no identity switch from the address bar", () => {
    const r = resolveIdentity({
      hostname: "sentinelfortunerecords.sentinelfortune.com",
      pathname: "/i/lumenschoolacademy/",
      search: "?i=oglegacystore",
    });
    assert.equal(r.identity, "sentinelfortunerecords");
    assert.equal(r.source, "HOSTNAME");
  });

  test("a preview host uses the path prefix", () => {
    const r = resolveIdentity({ hostname: "sf-platform.vercel.app", pathname: "/i/lumengame/browse" });
    assert.equal(r.identity, "lumengame");
    assert.equal(r.devPrefix, "/i/lumengame");
  });

  test("an unknown host with no hint yields no identity", () => {
    assert.equal(resolveIdentity({ hostname: "example.com", pathname: "/" }).identity, null);
  });

  test("an invalid slug in the prefix is not accepted", () => {
    assert.equal(resolveIdentity({ hostname: "x.vercel.app", pathname: "/i/nope/" }).identity, null);
  });

  test("isCanonicalHost is true only for the seven", () => {
    assert.equal(isCanonicalHost("lumengame.sentinelfortune.com"), true);
    assert.equal(isCanonicalHost("sf.vercel.app"), false);
    assert.equal(isCanonicalHost("localhost"), false);
  });
});

describe("router — paths resolve to views", () => {
  const id = "lumenschoolacademy";

  test("home, browse, collections", () => {
    assert.equal(resolveView({ identity: id, pathname: "/" }).view, "home");
    assert.equal(resolveView({ identity: id, pathname: "/browse" }).view, "browse");
    assert.equal(resolveView({ identity: id, pathname: "/collections" }).view, "collections");
  });

  test("browse carries type, query and filter", () => {
    const v = resolveView({ identity: id, pathname: "/browse", search: "?type=COURSE&q=floor&filter=free" });
    assert.equal(v.type, "COURSE");
    assert.equal(v.q, "floor");
    assert.equal(v.filter, "free");
  });

  test("the detail segment is the branch's own word", () => {
    assert.deepEqual(resolveView({ identity: id, pathname: "/learn/floor" }), { view: "detail", slug: "floor" });
    assert.equal(resolveView({ identity: id, pathname: "/release/floor" }).view, "notfound",
      "another branch's segment must not resolve here");
    assert.deepEqual(resolveView({ identity: "sentinelfortunerecords", pathname: "/release/origin-echo" }), { view: "detail", slug: "origin-echo" });
  });

  test("all seven segments are distinct", () => {
    const segs = allBranches().map((b) => b.segment);
    assert.equal(new Set(segs).size, 7, `segments collide: ${segs.join(",")}`);
  });

  test("an unknown path is notfound, never a silent fallback to home", () => {
    assert.equal(resolveView({ identity: id, pathname: "/nope/nope" }).view, "notfound");
    assert.equal(resolveView({ identity: id, pathname: "/learn" }).view, "notfound");
  });

  test("a trailing slash does not create a second route", () => {
    assert.equal(resolveView({ identity: id, pathname: "/browse/" }).view, "browse");
    assert.equal(resolveView({ identity: id, pathname: "/learn/floor/" }).view, "detail");
  });

  test("the dev prefix is stripped before matching", () => {
    const v = resolveView({ identity: id, pathname: "/i/lumenschoolacademy/learn/floor", devPrefix: "/i/lumenschoolacademy" });
    assert.deepEqual(v, { view: "detail", slug: "floor" });
  });
});

describe("router — links and canonicals", () => {
  test("dev links carry the prefix; production links do not", () => {
    const dev = links("lumengame", "/i/lumengame");
    assert.equal(dev.browse({ type: "GAME" }), "/i/lumengame/browse?type=GAME");
    const prod = links("lumengame", "");
    assert.equal(prod.browse({ type: "GAME" }), "/browse?type=GAME");
    assert.equal(prod.detail({ slug: "s5" }), "/play/s5");
  });

  test("the canonical always names the PRODUCTION host, never the preview", () => {
    assert.equal(
      canonicalUrl("lumenschoolacademy", { view: "detail", slug: "floor" }),
      "https://lumenschoolacademy.sentinelfortune.com/learn/floor");
    assert.equal(canonicalUrl("lumengame", { view: "home" }), "https://lumengame.sentinelfortune.com/");
  });

  test("all seven canonical hosts are published for the hub to link", () => {
    const hosts = canonicalHosts();
    assert.equal(hosts.length, 7);
    for (const hv of hosts) {
      assert.match(hv.url, /^https:\/\/[a-z]+\.sentinelfortune\.com\/$/);
      assert.ok(!/localhost|127\.0\.0\.1|vercel\.app/.test(hv.url), `${hv.url} is not a public address`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   FEED
   ═══════════════════════════════════════════════════════════════════════ */

describe("feed — the envelope is governance, not decoration", () => {
  test("the shipped fixture file is a valid envelope", () => {
    const e = readEnvelope(FEED);
    assert.equal(e.ok, true, e.problems.join("; "));
    assert.ok(e.records.length > 0);
  });

  test("the shipped fixture is marked TEST_PREVIEW, not LIVE", () => {
    assert.equal(readEnvelope(FEED).evidence, "TEST_PREVIEW");
  });

  test("a missing evidence marker fails SAFE to preview", () => {
    const { evidence, ...rest } = FEED;
    assert.equal(readEnvelope(rest).evidence, "TEST_PREVIEW");
  });

  test("a wrong schema is refused with NO records — never a partial read", () => {
    const e = readEnvelope({ ...FEED, schema: "something.else/9" });
    assert.equal(e.ok, false);
    assert.deepEqual(e.records, []);
  });

  test("a feed from another system is refused", () => {
    const e = readEnvelope({ ...FEED, source: { system: "SOMEONE_ELSE" } });
    assert.equal(e.ok, false);
    assert.match(e.problems.join(" "), /source\.system/);
  });

  test("loadFeed returns an error object rather than throwing", async () => {
    const net = await loadFeed({ url: "x", fetchImpl: async () => { throw new Error("offline"); } });
    assert.equal(net.ok, false);
    assert.equal(net.error, "NETWORK");

    const http = await loadFeed({ url: "x", fetchImpl: async () => ({ ok: false, status: 404 }) });
    assert.equal(http.error, "HTTP");

    const parse = await loadFeed({ url: "x", fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }) });
    assert.equal(parse.error, "PARSE");

    const good = await loadFeed({ url: "x", fetchImpl: async () => ({ ok: true, json: async () => FEED }) });
    assert.equal(good.ok, true);
    assert.equal(good.evidence, "TEST_PREVIEW");
  });

  test("the schema constant is the one the fixture declares", () => {
    assert.equal(FEED.schema, FEED_SCHEMA);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   THE FIXTURE PROVES THE WHOLE FLOW
   ═══════════════════════════════════════════════════════════════════════ */

describe("fixtures — every identity has governed evidence", () => {
  test("all seven houses receive at least one public record", () => {
    for (const id of IDENTITIES) {
      const { accepted } = selectPublic(FEED.records, id);
      assert.ok(accepted.length >= 1, `${id} has no governed fixture`);
    }
  });

  test("every accepted record has a specialized renderer", () => {
    for (const id of IDENTITIES) {
      for (const r of selectPublic(FEED.records, id).accepted) {
        assert.ok(rendererFor(r.type), `${r.type} has no renderer`);
        assert.ok(rendererName(r.type), `${r.type} renderer is unnamed`);
      }
    }
  });

  test("every content type maps to exactly one renderer", () => {
    for (const t of TYPES) assert.ok(rendererFor(t), `${t} has no renderer`);
  });

  test("the four invalid fixtures are each refused for the stated reason", () => {
    const byId = (id) => FEED.records.find((r) => r.id === id);

    assert.equal(publicReadiness(byId("test-reject-010")).public, false, "DRAFT must be refused");
    assert.equal(publicReadiness(byId("test-reject-011")).public, false, "string approval must be refused");
    assert.equal(publicReadiness(byId("test-reject-012")).public, false, "unknown identity must be refused");
    assert.equal(publicReadiness(byId("test-reject-014")).public, false, "withheld must be refused");
  });

  test("the localhost-destination fixture is public but loses its CTA", () => {
    const raw = FEED.records.find((r) => r.id === "test-reject-013");
    assert.equal(publicReadiness(raw).public, true, "the record itself is valid");
    const n = normalize(raw);
    assert.equal(n.cta, null, "the localhost CTA must be stripped");
    assert.equal(ctaState(n).enabled, false);
  });

  test("NO record anywhere in the feed yields a localhost link", () => {
    for (const id of IDENTITIES) {
      for (const r of selectPublic(FEED.records, id).accepted) {
        if (r.cta) assert.ok(!/localhost|127\.0\.0\.1/.test(r.cta.destination), `${r.slug} leaks a local address`);
        for (const m of r.media) assert.ok(!/localhost|127\.0\.0\.1/.test(m.src));
      }
    }
  });

  test("the OG Legacy buy-with-no-price fixture disables its button", () => {
    const { accepted } = selectPublic(FEED.records, "oglegacystore");
    const r = accepted.find((x) => x.slug === "legacy-first-collection");
    assert.ok(r, "fixture missing");
    assert.equal(priceState(r).state, "UNPRICED");
    const c = ctaState(r);
    assert.equal(c.enabled, false);
    assert.match(c.note, /[Pp]rice not published/);
  });

  test("the paid LightNode fixture renders a real price and a saving", () => {
    const { accepted } = selectPublic(FEED.records, "lightnodesystems");
    const r = accepted.find((x) => x.slug === "ledger-watch");
    const s = priceState(r);
    assert.equal(s.state, "PAID");
    assert.equal(s.label, "$49");
    assert.deepEqual(s.compareAt, { amount: 79, currency: "USD" });
    assert.equal(ctaState(r).enabled, true);
  });

  test("the two real artefacts are present and marked as real", () => {
    const floor = selectPublic(FEED.records, "lumenschoolacademy").accepted.find((r) => r.slug === "floor");
    const game = selectPublic(FEED.records, "lumengame").accepted.find((r) => r.slug === "s5-ascent-lite");
    assert.ok(floor && floor.metadata.real_artefact === true);
    assert.ok(game && game.metadata.real_artefact === true);
    /* Ownership by problem domain: Floor is a business tool and belongs to the
       education/business house, not to the technical one. */
    assert.equal(floor.identity, "lumenschoolacademy");
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   DYNAMIC FEED SOURCE + STATIC FALLBACK

   The public feed moved from a repo-static file to the Editorial Corridor's
   D1 database behind /api/feed. The fallback is the part that must not be
   taken on trust: if it breaks, a world shows an empty catalogue rather than
   the records that are sitting in the repository.
   ───────────────────────────────────────────────────────────────────────── */

describe("feed — dynamic source with static fallback", () => {
  const envelope = {
    schema: "sf.public-site/1.0",
    evidence: "TEST_PREVIEW",
    source: { system: "EDITORIAL_CORRIDOR", generated_at: "2026-10-20T06:34:00Z" },
    records: [{
      id: "t1", slug: "t1", identity: "vibraflowmedia", type: "TEACHING", title: "T",
      pricingTier: "FREE", media: [], publicationStatus: "PUBLIC_SITE",
      publicReadiness: { approved: true, withheld: false },
    }],
  };
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const fail = (status) => ({ ok: false, status, json: async () => ({}) });

  test("prefers the dynamic source when it answers", async () => {
    const seen = [];
    const r = await loadFeed({ fetchImpl: async (u) => { seen.push(u); return ok(envelope); } });
    assert.equal(r.ok, true);
    assert.equal(r.feedSource, "DYNAMIC");
    assert.deepEqual(seen, [DEFAULT_FEED_URL]);
  });

  test("falls back to the static file on 503, and says which source served", async () => {
    const seen = [];
    const r = await loadFeed({ fetchImpl: async (u) => { seen.push(u); return u === DEFAULT_FEED_URL ? fail(503) : ok(envelope); } });
    assert.equal(r.ok, true);
    assert.equal(r.feedSource, "STATIC_FALLBACK");
    assert.deepEqual(seen, [DEFAULT_FEED_URL, STATIC_FEED_URL]);
    assert.equal(r.records.length, 1);
  });

  test("falls back when the dynamic source answers with unusable JSON", async () => {
    const r = await loadFeed({ fetchImpl: async (u) =>
      u === DEFAULT_FEED_URL ? { ok: true, status: 200, json: async () => { throw new Error("not json"); } } : ok(envelope) });
    assert.equal(r.ok, true);
    assert.equal(r.feedSource, "STATIC_FALLBACK");
  });

  test("falls back when the dynamic source throws outright", async () => {
    const r = await loadFeed({ fetchImpl: async (u) => {
      if (u === DEFAULT_FEED_URL) throw new Error("network down");
      return ok(envelope);
    } });
    assert.equal(r.ok, true);
    assert.equal(r.feedSource, "STATIC_FALLBACK");
  });

  test("when BOTH sources fail it reports failure rather than an empty catalogue", async () => {
    const r = await loadFeed({ fetchImpl: async () => fail(500) });
    assert.equal(r.ok, false);
    assert.equal(r.feedSource, "NONE");
    assert.equal(r.records.length, 0);
  });

  test("an explicit url is never silently redirected", async () => {
    const seen = [];
    await loadFeed({ url: "/custom/feed.json", fetchImpl: async (u) => { seen.push(u); return ok(envelope); } });
    assert.deepEqual(seen, ["/custom/feed.json"]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   DEEP LINKS — THE HOSTING CONTRACT

   Every route below `/` exists only because the host rewrites unknown paths
   onto the one runtime file. That rewrite lives in vercel.json, which no other
   test reads, so a config edit could — and did — take every deep link down
   while all 100-odd runtime tests stayed green.

   The specific defect these guard: with `cleanUrls: true` the host generates a
   308 on `/…/index(.html)` ahead of the filesystem, so a rewrite whose
   destination still carried `.html` sent every deep link back into that
   redirect instead of serving the runtime. Vercel says it plainly — with
   cleanUrls on, a destination must not carry a file extension — and nothing
   here was checking.
   ───────────────────────────────────────────────────────────────────────── */
describe("hosting — deep links reach the one runtime", () => {
  const VERCEL = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const spa = VERCEL.rewrites.find((r) => r.source.includes("(?!"));

  test("there is exactly one SPA fallback rewrite", () => {
    assert.ok(spa, "no catch-all rewrite found in vercel.json");
    assert.equal(VERCEL.rewrites.length, 1);
  });

  test("its destination carries no file extension while cleanUrls is on", () => {
    if (VERCEL.cleanUrls !== true) return;        // the rule only binds then
    assert.ok(!/\.[a-z0-9]+$/i.test(spa.destination),
      `cleanUrls rewrites every /…/index(.html) away, so destination "${spa.destination}" cannot resolve`);
  });

  test("it carries every route the router can produce, and nothing served as a file", () => {
    /* Compiled the way the host compiles it: the source is path-to-regexp
       with one unnamed group, which becomes ^/(…)$. */
    const re = new RegExp(`^${spa.source.replace(/^\//, "\\/")}$`);
    const segments = allBranches().map((b) => b.segment);
    assert.equal(new Set(segments).size, 7);

    for (const seg of segments) {
      assert.ok(re.test(`/${seg}/the-cost-of-an-unmade-decision`), `/${seg}/<slug> must reach the runtime`);
    }
    for (const route of ["/", "/browse", "/collections", "/c/Foundations", "/i/vibraflowmedia/reflect/x"]) {
      assert.ok(re.test(route), `${route} must reach the runtime`);
    }
    /* And the paths that are real files or functions must NOT be swallowed —
       /api/ above all, or the corridor and the feed become the homepage. */
    for (const real of ["/api/feed", "/api/corridor", "/engine/boot.js", "/feed/public-site.json",
                        "/assets/x.webp", "/app.css", "/robots.txt", "/sitemap.xml"]) {
      assert.ok(!re.test(real), `${real} must never be rewritten to the runtime`);
    }
  });
});
