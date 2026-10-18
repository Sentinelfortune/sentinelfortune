/* SFL EDITORIAL CORRIDOR — the governing tests.
 *
 * Each test below corresponds to a stated requirement of the corridor. They
 * are written against the PUBLIC surface (`createCorridor`) rather than the
 * internals, so they test the corridor an integration actually gets.
 *
 *   node --test corridor/tests/
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createCorridor, CLIENT_ACTIONS, OWNER_ACTIONS } from "../actions.js";
import { fromChatGPT } from "../adapters/chatgpt.js";
import { fromClaude } from "../adapters/claude.js";
import { FORBIDDEN_PUBLIC_KEYS, FEED_SCHEMA, toPublicRecord } from "../core/publish.js";
import { validate, assertNoCommercialAuthority, PRESENTATION, CONTENT_TYPES } from "../schema/record.js";
import { resolveIntent } from "../core/intent.js";
import { validateMedium } from "../core/media.js";
import { BRANCH_TOKENS, accepts } from "../core/branches.js";
import { isPublic } from "../schema/states.js";
import { clientIdentity } from "../core/authority.js";
import { CTA_KINDS, TYPES, selectPublic } from "../../platform/engine/core.js";

/* ── fixtures ──────────────────────────────────────────────────────────── */

let n = 0;
const iid = (label) => `test_instr_${label}_${++n}`;

/** A ChatGPT action request — flat, snake_case. */
function chatgptRequest(over = {}) {
  return {
    operation: "PREPARE",
    instruction_id: iid("cg"),
    branch: "VIBRAFLOW_MEDIA",
    content_type: "TEACHING",
    title: "The Weight of a Quiet Morning",
    slug: "weight-of-a-quiet-morning",
    summary: "A teaching on beginning again without noise.",
    body: "There is a kind of strength that does not announce itself. This teaching sits with it for twelve minutes.",
    language: "en",
    ...over,
  };
}

/** A Claude tool call — nested, camelCase. */
function claudeRequest(over = {}) {
  const { editorial = {}, ...rest } = over;
  return {
    intent: "PREPARE",
    instructionId: iid("cl"),
    editorial: {
      branch: "LUMEN_SCHOOL_ACADEMY",
      contentType: "LESSON",
      title: "What a Price Actually Says",
      slug: "what-a-price-actually-says",
      summary: "A free lesson on pricing as a message.",
      body: "A price is a sentence your business speaks before you do. This lesson reads that sentence out loud.",
      language: "en",
      ...editorial,
    },
    ...rest,
  };
}

function prepared(corridor, who = "claude", over = {}) {
  const res = who === "claude" ? corridor.claude(claudeRequest(over)) : corridor.chatgpt(chatgptRequest(over));
  assert.equal(res.ok, true, res.reason || "");
  return res.record;
}

function publishedRecord(corridor, who = "claude", over = {}) {
  const record = prepared(corridor, who, over);
  const approval = corridor.approve({ recordId: record.id });
  assert.equal(approval.ok, true, approval.reason || "");
  const res = who === "claude"
    ? corridor.claude({ intent: "PUBLISH", instructionId: iid("pub"), recordId: record.id })
    : corridor.chatgpt({ operation: "PUBLISH", instruction_id: iid("pub"), record_id: record.id });
  assert.equal(res.ok, true, res.reason || "");
  return res.record;
}

/* ─────────────────────────────────────────────────────────────────────────
   1. A ChatGPT-SHAPED REQUEST NORMALIZES CORRECTLY
   ───────────────────────────────────────────────────────────────────────── */

test("1 — a ChatGPT-shaped request normalizes into the corridor command", () => {
  const command = fromChatGPT(chatgptRequest({ topics: ["stillness"], hero_media: null, author_display: "Sentinel Fortune" }));

  assert.equal(command.client, "CLIENT_CHATGPT");
  assert.equal(command.action, "create_draft");
  assert.equal(command.record.branch, "VIBRAFLOW_MEDIA");
  assert.equal(command.record.contentType, "TEACHING");
  assert.equal(command.record.authorDisplay, "Sentinel Fortune");
  assert.equal(command.recordId, "ed_vibraflow_media_weight-of-a-quiet-morning");

  const corridor = createCorridor();
  const res = corridor.chatgpt(chatgptRequest());
  assert.equal(res.ok, true);
  assert.equal(res.record.presentationType, "TEACHING");
  assert.equal(res.record.sourceClient, "CLIENT_CHATGPT");
});

/* ─────────────────────────────────────────────────────────────────────────
   2. A CLAUDE-SHAPED REQUEST NORMALIZES CORRECTLY — AND IDENTICALLY
   ───────────────────────────────────────────────────────────────────────── */

test("2 — a Claude-shaped request normalizes into the SAME command shape", () => {
  const fromChat = fromChatGPT(chatgptRequest());
  const fromCl = fromClaude(claudeRequest({
    editorial: {
      branch: "VIBRAFLOW_MEDIA", contentType: "TEACHING",
      title: "The Weight of a Quiet Morning", slug: "weight-of-a-quiet-morning",
      summary: "A teaching on beginning again without noise.",
      body: "There is a kind of strength that does not announce itself. This teaching sits with it for twelve minutes.",
      language: "en",
    },
  }));

  /* Same keys, same action, same id — only the client differs. */
  assert.deepEqual(Object.keys(fromChat).sort(), Object.keys(fromCl).sort());
  assert.equal(fromCl.action, fromChat.action);
  assert.equal(fromCl.recordId, fromChat.recordId);
  assert.deepEqual(
    { ...fromCl.record, id: null }, { ...fromChat.record, id: null },
  );
  assert.notEqual(fromCl.client, fromChat.client);

  const corridor = createCorridor();
  const res = corridor.claude(claudeRequest());
  assert.equal(res.ok, true);
  assert.equal(res.record.sourceClient, "CLIENT_CLAUDE");
  assert.equal(res.record.presentationType, "COURSE");  // LESSON presents as COURSE
});

/* ─────────────────────────────────────────────────────────────────────────
   3. AN AMBIGUOUS INSTRUCTION DEFAULTS TO PREPARE — NEVER TO PUBLISH
   ───────────────────────────────────────────────────────────────────────── */

test("3 — ambiguous intent defaults to PREPARE and is marked not confident", () => {
  for (const utterance of [
    "", "do the thing", "handle this", "fais le nécessaire",
    "can you sort out the morning teaching", "ok", undefined,
  ]) {
    const r = resolveIntent({ utterance });
    assert.equal(r.intent, "PREPARE", `${JSON.stringify(utterance)} must not resolve away from PREPARE`);
    assert.equal(r.confident, false);
  }

  /* An unrecognised explicit intent falls all the way back too. */
  assert.equal(resolveIntent({ explicit: "SHIP_IT", utterance: "publish it now" }).intent, "PREPARE");

  /* And through the real corridor: a vague instruction creates a DRAFT. */
  const corridor = createCorridor();
  const res = corridor.claude({ ...claudeRequest(), intent: null, ownerUtterance: "handle this one for me" });
  assert.equal(res.ok, true);
  assert.equal(res.state, "DRAFT");
  assert.equal(res.confident, false);
  assert.equal(corridor.feed().records.length, 0);
});

/* ─────────────────────────────────────────────────────────────────────────
   4. AN EXPLICIT PUBLISH, ON AN OWNER-APPROVED RECORD, PUBLISHES
   ───────────────────────────────────────────────────────────────────────── */

test("4 — explicit PUBLISH on an approved record reaches the public feed", () => {
  const corridor = createCorridor();
  const draft = prepared(corridor, "claude");

  /* Explicit publish BEFORE approval is refused — and names why. */
  const tooSoon = corridor.claude({ intent: "PUBLISH", instructionId: iid("early"), recordId: draft.id });
  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.code, "OWNER_APPROVAL_REQUIRED");
  assert.equal(corridor.feed().records.length, 0);

  corridor.approve({ recordId: draft.id });
  const res = corridor.claude({ intent: "PUBLISH", instructionId: iid("pub"), recordId: draft.id });
  assert.equal(res.ok, true);
  assert.equal(res.state, "PUBLISHED");

  const feed = corridor.feed();
  assert.equal(feed.schema, FEED_SCHEMA);
  assert.equal(feed.records.length, 1);
  assert.equal(feed.records[0].identity, "lumenschoolacademy");

  /* The approval was spent. A second publish needs a second approval. */
  const again = corridor.claude({ intent: "PUBLISH", instructionId: iid("pub2"), recordId: draft.id });
  assert.equal(again.ok, false);
  assert.equal(again.code, "OWNER_APPROVAL_REQUIRED");
});

test("4b — an approval is stale once the text changes underneath it", () => {
  const corridor = createCorridor();
  const draft = prepared(corridor, "claude");
  corridor.approve({ recordId: draft.id });

  /* The classic swap: approved innocuous text, then edited before publishing. */
  const edited = corridor.claude({
    intent: "UPDATE", instructionId: iid("swap"), recordId: draft.id,
    editorial: { body: "Entirely different text that the Owner never read or approved." },
  });
  assert.equal(edited.ok, true);
  assert.equal(edited.record.version, 2);

  const res = corridor.claude({ intent: "PUBLISH", instructionId: iid("stale"), recordId: draft.id });
  assert.equal(res.ok, false);
  assert.equal(res.code, "APPROVAL_STALE");
  assert.equal(corridor.feed().records.length, 0);
});

/* ─────────────────────────────────────────────────────────────────────────
   5. THE WRONG BRANCH IS REJECTED — NOT SILENTLY REDIRECTED
   ───────────────────────────────────────────────────────────────────────── */

test("5 — a branch that does not publish that kind of work refuses it", () => {
  const corridor = createCorridor();

  /* VibraFlow does not publish technical tutorials. */
  const res = corridor.chatgpt(chatgptRequest({ content_type: "TUTORIAL" }));
  assert.equal(res.ok, false);
  assert.equal(res.step, "IDENTITY_VALIDATION");
  assert.equal(res.code, "BRANCH_REJECTS_TYPE");
  assert.match(res.reason, /VibraFlow Media does not publish TUTORIAL/);
  /* Refused, not moved: nothing was written anywhere. */
  assert.equal(corridor.store.all().length, 0);

  /* An unknown destination is refused outright. */
  const unknown = corridor.chatgpt(chatgptRequest({ branch: "SENTINEL_FORTUNE_HOLDINGS" }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "UNKNOWN_BRANCH");

  /* Every content type is accepted by at least one of the seven, so the
     vocabulary and the destinations cannot drift apart. */
  for (const type of CONTENT_TYPES) {
    assert.ok(
      BRANCH_TOKENS.some((b) => accepts(b, type).ok),
      `no branch accepts ${type}`,
    );
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   6. A DRAFT IS NEVER PUBLIC
   ───────────────────────────────────────────────────────────────────────── */

test("6 — a draft never appears publicly, by any route", () => {
  const corridor = createCorridor();
  const draft = prepared(corridor, "chatgpt");

  assert.equal(draft.status, "DRAFT");
  assert.equal(isPublic("DRAFT"), false);
  assert.equal(isPublic("PREVIEW"), false);
  assert.equal(isPublic("APPROVED"), false);
  assert.equal(corridor.feed().records.length, 0);
  assert.equal(corridor.feedForBranch("vibraflowmedia").records.length, 0);

  /* Approval alone is not publication. */
  corridor.approve({ recordId: draft.id });
  assert.equal(corridor.feed().records.length, 0);

  /* And a rendered preview of a draft is still not in the feed. */
  corridor.chatgpt({ operation: "PREVIEW", instruction_id: iid("pv"), record_id: draft.id });
  assert.equal(corridor.feed().records.length, 0);
});

/* ─────────────────────────────────────────────────────────────────────────
   7. A PREVIEW NEVER MASQUERADES AS LIVE
   ───────────────────────────────────────────────────────────────────────── */

test("7 — a preview is labelled a preview and says it is not live", () => {
  const corridor = createCorridor();
  const draft = prepared(corridor, "claude");

  const pv = corridor.claude({ intent: "PREVIEW", instructionId: iid("pv"), recordId: draft.id });
  assert.equal(pv.ok, true);
  assert.equal(pv.preview, true);
  assert.equal(pv.isLive, false);
  assert.equal(pv.state, "DRAFT");
  assert.equal(pv.step, "PREVIEW_BUILD");
  assert.equal(pv.branchName, "Lumen School Academy");

  /* It renders exactly what the public would see — same function, same shape —
     which is what makes the preview honest rather than decorative. */
  assert.deepEqual(Object.keys(pv.renderings.en).sort(), Object.keys(toPublicRecord(draft)).sort());

  /* But nothing changed state and nothing is in the feed. */
  assert.equal(corridor.store.get(draft.id).status, "DRAFT");
  assert.equal(corridor.feed().records.length, 0);
});

/* ─────────────────────────────────────────────────────────────────────────
   8. A DUPLICATE INSTRUCTION DOES NOT DUPLICATE CONTENT
   ───────────────────────────────────────────────────────────────────────── */

test("8 — replaying an instruction returns the original outcome and writes nothing", () => {
  const corridor = createCorridor();
  const request = claudeRequest();

  const first = corridor.claude(request);
  const second = corridor.claude(request);          // byte-identical retry
  const third = corridor.claude(request);

  assert.equal(first.ok, true);
  assert.equal(second.replay, true);
  assert.equal(third.replay, true);
  assert.equal(second.record.id, first.record.id);
  assert.equal(second.record.version, 1);
  assert.equal(corridor.store.all().length, 1);

  /* Replaying a PUBLISH does not publish twice either. */
  corridor.approve({ recordId: first.record.id });
  const pub = { intent: "PUBLISH", instructionId: iid("once"), recordId: first.record.id };
  const p1 = corridor.claude(pub);
  const p2 = corridor.claude(pub);
  assert.equal(p1.ok, true);
  assert.equal(p2.replay, true);
  assert.equal(corridor.feed().records.length, 1);

  /* Two DIFFERENT instructions for the same slug do not create two records —
     the id is derived from branch + slug, so the second is an update. */
  const sameSlug = corridor.claude({ ...claudeRequest(), intent: "UPDATE" });
  assert.equal(sameSlug.ok, true);
  assert.equal(corridor.store.all().length, 1);
});

/* ─────────────────────────────────────────────────────────────────────────
   9. AN UPDATE CREATES A VERSION AND LOSES NOTHING
   ───────────────────────────────────────────────────────────────────────── */

test("9 — an update creates a new version and keeps the previous text", () => {
  const corridor = createCorridor();
  const v1 = prepared(corridor, "claude");
  assert.equal(v1.version, 1);
  assert.equal(v1.revisionHistory.length, 0);

  const res = corridor.claude({
    intent: "UPDATE", instructionId: iid("up"), recordId: v1.id,
    editorial: { title: "What a Price Actually Says — Revised" },
  });
  assert.equal(res.ok, true);

  const v2 = res.record;
  assert.equal(v2.version, 2);
  assert.equal(v2.title, "What a Price Actually Says — Revised");
  assert.equal(v2.revisionHistory.length, 1);
  assert.equal(v2.revisionHistory[0].version, 1);
  assert.equal(v2.revisionHistory[0].title, "What a Price Actually Says");
  /* A partial update must not erase the fields it did not mention. */
  assert.equal(v2.body, v1.body);
  assert.equal(v2.branch, v1.branch);
  assert.equal(v2.slug, v1.slug);
});

/* ─────────────────────────────────────────────────────────────────────────
   10. UNPUBLISH REMOVES IT FROM THE FEED WITHOUT DELETING ANYTHING
   ───────────────────────────────────────────────────────────────────────── */

test("10 — unpublish withdraws from the public feed and keeps the history", () => {
  const corridor = createCorridor();
  const record = publishedRecord(corridor, "claude");
  assert.equal(corridor.feed().records.length, 1);

  /* An AI client cannot withdraw on its own authority either. */
  const unapproved = corridor.claude({ intent: "UNPUBLISH", instructionId: iid("u0"), recordId: record.id });
  assert.equal(unapproved.ok, false);
  assert.equal(unapproved.code, "OWNER_APPROVAL_REQUIRED");
  assert.equal(corridor.feed().records.length, 1);

  corridor.authorizeWithdrawal({ recordId: record.id, action: "unpublish" });
  const res = corridor.claude({ intent: "UNPUBLISH", instructionId: iid("u1"), recordId: record.id });
  assert.equal(res.ok, true);
  assert.equal(res.state, "UNPUBLISHED");

  assert.equal(corridor.feed().records.length, 0);
  /* Still there, still readable, still versioned. Withdrawn, not destroyed. */
  const kept = corridor.store.get(record.id);
  assert.equal(kept.status, "UNPUBLISHED");
  assert.equal(kept.title, record.title);
  assert.equal(kept.body, record.body);
  assert.ok(kept.audit.length > 0);
});

/* ─────────────────────────────────────────────────────────────────────────
   11. ROLLBACK RESTORES A PRIOR VERSION — AS A NEW VERSION
   ───────────────────────────────────────────────────────────────────────── */

test("11 — rollback restores the prior text and is itself recorded", () => {
  const corridor = createCorridor();
  const v1 = prepared(corridor, "claude");
  corridor.claude({
    intent: "UPDATE", instructionId: iid("u"), recordId: v1.id,
    editorial: { title: "A Worse Title", body: "Text the Owner did not want, twenty characters long." },
  });

  const rolled = corridor.rollback({ recordId: v1.id, toVersion: 1 });
  assert.equal(rolled.ok, true);
  assert.equal(rolled.record.title, v1.title);
  assert.equal(rolled.record.body, v1.body);
  /* Version 3, not version 1 — rolling back is a forward act. */
  assert.equal(rolled.record.version, 3);
  assert.equal(rolled.record.revisionHistory.length, 2);
  assert.equal(rolled.record.revisionHistory[1].title, "A Worse Title");

  /* A version that was never written cannot be restored. */
  assert.equal(corridor.rollback({ recordId: v1.id, toVersion: 99 }).ok, false);
});

/* ─────────────────────────────────────────────────────────────────────────
   12. FR / EN TRANSLATIONS WORK — ONE RECORD, TWO LANGUAGES
   ───────────────────────────────────────────────────────────────────────── */

test("12 — a record carries FR and EN without becoming two records", () => {
  const corridor = createCorridor();
  const record = prepared(corridor, "claude", {
    editorial: {
      translations: {
        fr: {
          title: "Ce qu'un prix dit vraiment",
          summary: "Une leçon gratuite sur le prix comme message.",
          body: "Un prix est une phrase que votre entreprise prononce avant vous. Cette leçon la lit à voix haute.",
        },
      },
    },
  });

  assert.equal(corridor.store.all().length, 1);         // ONE record
  assert.deepEqual(Object.keys(record.translations), ["fr"]);

  const pv = corridor.claude({ intent: "PREVIEW", instructionId: iid("pv"), recordId: record.id });
  assert.deepEqual(pv.languages.sort(), ["en", "fr"]);
  assert.equal(pv.renderings.fr.title, "Ce qu'un prix dit vraiment");
  assert.equal(pv.renderings.en.title, "What a Price Actually Says");
  /* Same id in both languages — the piece is one piece. */
  assert.equal(pv.renderings.fr.id, pv.renderings.en.id);

  /* A translation in the canonical language is a mistake, and is named. */
  const bad = validate({ ...record, translations: { en: { title: "x", body: "y" } } }, { branches: BRANCH_TOKENS });
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.some((p) => /duplicates the canonical language/.test(p)));
});

/* ─────────────────────────────────────────────────────────────────────────
   13. RIGHTS-REQUIRED MEDIA RULES WORK
   ───────────────────────────────────────────────────────────────────────── */

test("13 — media without rights, alt text or a declared source is refused", () => {
  /* Scraped imagery is refused BY NAME. */
  const scraped = validateMedium({ kind: "HERO", src: "https://example.com/a.jpg", source: "SCRAPED", altText: "x" });
  assert.equal(scraped.ok, false);
  assert.ok(scraped.problems.some((p) => /SCRAPED is not a permitted media source/.test(p)));

  /* A public-licence asset needs its licence AND its approval recorded. */
  const noRights = validateMedium({ kind: "HERO", src: "https://cdn/x.jpg", source: "APPROVED_PUBLIC", altText: "x" });
  assert.equal(noRights.ok, false);
  assert.ok(noRights.problems.some((p) => /requires rights\.licence/.test(p)));
  assert.ok(noRights.problems.some((p) => /rights\.approved === true/.test(p)));

  const withRights = validateMedium({
    kind: "HERO", src: "https://cdn/x.jpg", source: "APPROVED_PUBLIC", altText: "A lit window at dawn",
    rights: { licence: "CC0-1.0", approved: true },
  });
  assert.equal(withRights.ok, true);

  /* Alt text is required on anything visual. */
  assert.equal(validateMedium({ kind: "COVER", src: "x", source: "OWNER_PROVIDED" }).ok, false);

  /* And the pipeline refuses the record, naming the step. */
  const corridor = createCorridor();
  const res = corridor.chatgpt(chatgptRequest({
    hero_media: { kind: "HERO", src: "https://benchmark.example/hero.jpg", source: "SCRAPED", altText: "stolen" },
  }));
  assert.equal(res.ok, false);
  assert.equal(res.step, "MEDIA_RIGHTS");
  assert.equal(corridor.store.all().length, 0);
});

/* ─────────────────────────────────────────────────────────────────────────
   14. SUPPORT_THE_WORK IS NOT A PURCHASE
   ───────────────────────────────────────────────────────────────────────── */

test("14 — SUPPORT_THE_WORK is distinct from BUY and never becomes it", () => {
  const corridor = createCorridor();
  const record = publishedRecord(corridor, "claude", {
    editorial: {
      cta: { type: "SUPPORT_THE_WORK", destination: "https://sentinelfortune.com/support" },
    },
  });

  const published = corridor.feed().records[0];
  assert.equal(published.cta.kind, "SUPPORT");
  assert.notEqual(published.cta.kind, "BUY");
  assert.equal(published.cta.label, "Support the work");
  assert.equal(published.pricingTier, "FREE");

  /* SUPPORT exists in the engine's own vocabulary as its own kind, so the two
     cannot be conflated downstream either. */
  assert.ok(CTA_KINDS.includes("SUPPORT"));
  assert.ok(CTA_KINDS.includes("BUY"));

  /* No editorial CTA maps to BUY — including the one that points at a product. */
  const product = toPublicRecord({
    ...record,
    cta: { type: "VIEW_PRODUCT", destination: "https://sentinelfortune.com/shop/origin-echo" },
  });
  assert.equal(product.cta.kind, "OPEN");
  assert.notEqual(product.cta.kind, "BUY");
});

/* ─────────────────────────────────────────────────────────────────────────
   15. THE CORRIDOR CANNOT OVERRIDE A PRODUCT PRICE
   ───────────────────────────────────────────────────────────────────────── */

test("15 — the corridor refuses to state a price, and emits none", () => {
  for (const attempt of [
    { price: 4900 },
    { price: 0 },
    { compareAtPrice: 9900 },
    { pricingTier: "PAID" },
    { pricingTier: "UNPRICED" },
  ]) {
    const problems = assertNoCommercialAuthority(attempt);
    assert.ok(problems.length > 0, `${JSON.stringify(attempt)} should be refused`);
  }

  const corridor = createCorridor();
  const res = corridor.chatgpt({ ...chatgptRequest(), price: 4900 });
  /* The adapter does not even carry the field, so it cannot arrive — and if a
     record acquired one some other way, validation names it. */
  assert.equal(res.ok, true);
  assert.equal(res.record.price, undefined);

  const published = toPublicRecord(publishedRecord(createCorridor(), "claude"));
  assert.equal(published.price, undefined);
  assert.equal(published.compareAtPrice, undefined);
  assert.equal(published.pricingTier, "FREE");
});

/* ─────────────────────────────────────────────────────────────────────────
   16. THE CORRIDOR CANNOT CREATE CHECKOUT AUTHORITY
   ───────────────────────────────────────────────────────────────────────── */

test("16 — the corridor cannot carry a checkout, and refuses one that tries", () => {
  assert.ok(assertNoCommercialAuthority({ checkoutUrl: "https://checkout.stripe.com/x" }).length > 0);

  /* A product CTA may point at a product page. It may NOT point at a till. */
  for (const destination of [
    "https://checkout.stripe.com/pay/abc",
    "https://sentinelfortune.com/cart",
    "https://sentinelfortune.com/shop/checkout?sku=1",
  ]) {
    const problems = assertNoCommercialAuthority({ cta: { type: "VIEW_PRODUCT", destination } });
    assert.ok(problems.some((p) => /may not link straight into a checkout/.test(p)), destination);
  }
  assert.equal(assertNoCommercialAuthority({ cta: { type: "VIEW_PRODUCT", destination: "https://sentinelfortune.com/shop/origin-echo" } }).length, 0);

  const corridor = createCorridor();
  const res = corridor.claude(claudeRequest({
    editorial: { cta: { type: "VIEW_PRODUCT", destination: "https://checkout.stripe.com/pay/abc" } },
  }));
  assert.equal(res.ok, false);
  assert.equal(res.step, "EDITORIAL_VALIDATION");

  /* And nothing public ever carries a governing or commercial key. */
  const live = toPublicRecord(publishedRecord(createCorridor(), "claude"));
  for (const forbidden of FORBIDDEN_PUBLIC_KEYS) {
    assert.ok(!(forbidden in live), `public record must not carry ${forbidden}`);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   17. CROSS-BRANCH LEAKAGE IS PREVENTED
   ───────────────────────────────────────────────────────────────────────── */

test("17 — a branch only ever sees its own editorial content", () => {
  const corridor = createCorridor();
  publishedRecord(corridor, "chatgpt");                       // VibraFlow
  publishedRecord(corridor, "claude");                        // Academy

  assert.equal(corridor.feed().records.length, 2);
  const vibra = corridor.feedForBranch("vibraflowmedia").records;
  const academy = corridor.feedForBranch("lumenschoolacademy").records;

  assert.equal(vibra.length, 1);
  assert.equal(academy.length, 1);
  assert.equal(vibra[0].identity, "vibraflowmedia");
  assert.equal(academy[0].identity, "lumenschoolacademy");
  assert.notEqual(vibra[0].id, academy[0].id);
  /* The other five see nothing of either. */
  for (const slug of ["sentinelfortunerecords", "codexworldtv", "lumengame", "lightnodesystems", "oglegacystore"]) {
    assert.equal(corridor.feedForBranch(slug).records.length, 0, slug);
  }

  /* The same slug in two houses is two different things, kept apart by id. */
  const c2 = createCorridor();
  const a = c2.chatgpt(chatgptRequest({ branch: "VIBRAFLOW_MEDIA", content_type: "ARTICLE", slug: "beginnings" }));
  const b = c2.chatgpt(chatgptRequest({ branch: "CODEX_WORLD_TV", content_type: "ARTICLE", slug: "beginnings" }));
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.record.id, b.record.id);
  assert.equal(c2.store.all().length, 2);

  /* A slug already used WITHIN a house is refused rather than overwritten. */
  const clash = c2.chatgpt(chatgptRequest({
    branch: "VIBRAFLOW_MEDIA", content_type: "ARTICLE", slug: "beginnings",
    title: "A different article entirely", record_id: "ed_vibraflow_media_other",
  }));
  assert.equal(clash.ok, false);
  assert.equal(clash.code, "SLUG_TAKEN");
});

/* ─────────────────────────────────────────────────────────────────────────
   18. LEAST PRIVILEGE — NO INFRASTRUCTURE AUTHORITY, NO CREDENTIALS
   ───────────────────────────────────────────────────────────────────────── */

test("18 — the client surface is eight editorial actions and nothing else", () => {
  assert.deepEqual([...CLIENT_ACTIONS].sort(), [
    "archive", "create_draft", "get_preview", "get_record",
    "list_recent", "publish_approved", "unpublish", "update_draft",
  ]);

  /* Nothing resembling infrastructure authority exists as an action. */
  for (const forbidden of [
    "deploy", "merge", "push", "write_file", "run_command", "set_price",
    "create_checkout", "update_dns", "purge_cache", "charge", "refund",
  ]) {
    assert.ok(!CLIENT_ACTIONS.includes(forbidden), `${forbidden} must not be an action`);
  }

  const corridor = createCorridor();
  const res = corridor.request("CLIENT_CHATGPT", { ...chatgptRequest(), operation: "DEPLOY" });
  /* An unknown operation does not become an unknown action — it falls back to
     PREPARE, which is the safe end of the range. */
  assert.equal(res.ok, true);
  assert.equal(res.state, "DRAFT");

  /* Owner-only operations are not reachable from either adapter. */
  assert.deepEqual([...OWNER_ACTIONS], ["approve", "authorizeWithdrawal", "reject", "rollback"]);
  for (const owner of OWNER_ACTIONS) assert.ok(!CLIENT_ACTIONS.includes(owner));

  /* No credential VALUE is stored or returned anywhere. */
  const serialized = JSON.stringify(corridor.store.snapshot()) + JSON.stringify(corridor.auditTrail());
  assert.ok(!/sk_live|sk_test|Bearer |ghp_|-----BEGIN/.test(serialized));

  /* An unregistered client is refused before anything is evaluated. */
  const nobody = corridor.request("CLIENT_GEMINI", chatgptRequest());
  assert.equal(nobody.ok, false);
  assert.equal(nobody.code, "UNKNOWN_CLIENT");
});

test("18b — a client is rate limited, and a revoked client does nothing at all", () => {
  const corridor = createCorridor({
    clients: { CLIENT_CLAUDE: clientIdentity("CLIENT_CLAUDE", { rateLimitPerHour: 3 }) },
  });
  for (let i = 0; i < 3; i++) {
    assert.equal(corridor.claude(claudeRequest({ editorial: { slug: `rate-${i}`, title: `Rate limit probe ${i}` } })).ok, true);
  }
  const over = corridor.claude(claudeRequest({ editorial: { slug: "rate-4", title: "Rate limit probe 4" } }));
  assert.equal(over.ok, false);
  assert.equal(over.code, "RATE_LIMITED");

  const revoked = createCorridor({
    clients: { CLIENT_CHATGPT: clientIdentity("CLIENT_CHATGPT", { revoked: true }) },
  });
  const res = revoked.chatgpt(chatgptRequest());
  assert.equal(res.ok, false);
  assert.equal(res.code, "REVOKED");
  assert.equal(revoked.store.all().length, 0);
});

test("18c — the two read actions are reachable, and only when asked for outright", () => {
  const corridor = createCorridor();
  const draft = prepared(corridor, "chatgpt");

  const list = corridor.chatgpt({ operation: "LIST", instruction_id: iid("ls") });
  assert.equal(list.ok, true);
  assert.deepEqual(list.records.map((r) => r.id), [draft.id]);

  const got = corridor.claude({ intent: "GET", instructionId: iid("get"), recordId: draft.id });
  assert.equal(got.ok, true);
  assert.equal(got.record.title, draft.title);
  assert.equal(corridor.claude({ intent: "GET", instructionId: iid("get2"), recordId: "nope" }).code, "NOT_FOUND");

  /* A read is never INFERRED from the Owner's words — "show me the recent
     list" must not become a LIST and quietly compete with PREVIEW. */
  for (const utterance of ["show me the recent list", "list the academy pieces", "get the morning teaching"]) {
    assert.ok(!["LIST", "GET"].includes(resolveIntent({ utterance }).intent), utterance);
  }

  /* A read changes nothing. */
  assert.equal(corridor.store.get(draft.id).version, 1);
  assert.equal(corridor.store.get(draft.id).status, "DRAFT");
  assert.equal(corridor.feed().records.length, 0);
});

/* ─────────────────────────────────────────────────────────────────────────
   ONE ENGINE — the structural claim, asserted
   ───────────────────────────────────────────────────────────────────────── */

test("one engine — every editorial type presents as a type the engine renders", () => {
  for (const type of CONTENT_TYPES) {
    const presentation = PRESENTATION[type];
    assert.ok(presentation, `${type} has no presentation type`);
    assert.ok(TYPES.includes(presentation), `${presentation} is not a type the public engine renders`);
  }
});

test("one engine — a published editorial record passes the engine's own gate", () => {
  const corridor = createCorridor();
  publishedRecord(corridor, "claude", {
    editorial: { cta: { type: "SUPPORT_THE_WORK", destination: "https://sentinelfortune.com/support" } },
  });
  const feed = corridor.feed();

  const { accepted, rejected } = selectPublic(feed.records, "lumenschoolacademy");
  assert.equal(rejected.length, 0);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].type, "COURSE");
  assert.equal(accepted[0].pricingTier, "FREE");
  assert.equal(accepted[0].price, null);
  assert.equal(accepted[0].cta.kind, "SUPPORT");
  assert.equal(accepted[0].metadata.editorialLabel, "Lesson");

  /* The other six houses see it as another house's record, not as an error. */
  const elsewhere = selectPublic(feed.records, "vibraflowmedia");
  assert.equal(elsewhere.accepted.length, 0);
  assert.equal(elsewhere.rejected[0].reason, "OTHER_IDENTITY");
});
