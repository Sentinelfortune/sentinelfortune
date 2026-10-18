/* SFL EDITORIAL CORRIDOR — the MVP acceptance demonstration.
 *
 * Not a unit test. This walks the corridor end to end exactly as the two AI
 * clients would, in the order the mission specifies, and prints a transcript
 * a reader can check line by line:
 *
 *   1. CHATGPT  prepare -> preview -> explicit publish  -> VibraFlow Media
 *   2. CLAUDE   prepare -> preview -> explicit publish  -> Lumen School Academy
 *   3. REPLAY   both original commands, byte identical  -> no duplicates
 *   4. WITHDRAW unpublish one                           -> gone publicly, history intact
 *
 * It writes the resulting public editorial feed to corridor/editorial/public-feed.json,
 * which is the artefact the existing public engine would consume. Nothing here
 * touches production: TEST/PREVIEW records, an in-memory store, one local file.
 *
 *   node corridor/e2e/acceptance.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCorridor } from "../actions.js";
import { selectPublic } from "../../platform/engine/core.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FEED_PATH = resolve(HERE, "../editorial/public-feed.json");

let failures = 0;
let step = 0;

function check(label, condition, detail = "") {
  const ok = condition === true;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

function heading(text) {
  step++;
  console.log(`\n${"─".repeat(74)}\n${step}. ${text}\n${"─".repeat(74)}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   The corridor under test
   ═══════════════════════════════════════════════════════════════════════════ */

const corridor = createCorridor();

/* The exact commands, kept so step 3 can replay them byte for byte. */
const CHATGPT_PREPARE = {
  operation: "PREPARE",
  instruction_id: "owner-2026-10-18-vibraflow-stillness-01",
  user_message: "prépare un enseignement pour VibraFlow sur le silence du matin",
  branch: "VIBRAFLOW_MEDIA",
  content_type: "TEACHING",
  title: "The Discipline of an Unhurried Morning",
  slug: "discipline-of-an-unhurried-morning",
  summary: "A teaching on the first twenty minutes, and what they decide.",
  body: "Most people lose the day before it begins. Not to failure — to noise. This teaching sits with the first twenty minutes of a morning and asks what they are actually for. It is free, it is twelve minutes long, and it asks nothing of you but attention.",
  language: "en",
  translations: {
    fr: {
      title: "La discipline d'un matin sans hâte",
      summary: "Un enseignement sur les vingt premières minutes, et ce qu'elles décident.",
      body: "La plupart des gens perdent la journée avant qu'elle ne commence. Non par échec — par bruit. Cet enseignement s'assoit avec les vingt premières minutes d'un matin et demande à quoi elles servent vraiment. Il est gratuit, il dure douze minutes, et il ne demande rien d'autre que de l'attention.",
    },
  },
  topics: ["stillness", "discipline", "morning practice"],
  author_display: "Sentinel Fortune",
  hero_media: {
    kind: "HERO",
    src: "https://sentinelfortune.com/assets/editorial/unhurried-morning.jpg",
    source: "GOVERNED_GENERATED",
    altText: "First light across a quiet room",
  },
  cta: { type: "SUPPORT_THE_WORK", destination: "https://sentinelfortune.com/support" },
};

const CLAUDE_PREPARE = {
  intent: "PREPARE",
  instructionId: "owner-2026-10-18-academy-pricing-01",
  ownerUtterance: "prepare a free lesson for the Academy about what a price communicates",
  editorial: {
    branch: "LUMEN_SCHOOL_ACADEMY",
    contentType: "LESSON",
    title: "What a Price Actually Says",
    slug: "what-a-price-actually-says",
    summary: "A free lesson on pricing as a sentence your business speaks before you do.",
    body: "A price is not a number. It is a sentence your business speaks before you open your mouth, and most founders never read theirs back. This lesson reads it out loud: what a low price says, what a high one says, and what an unexplained one says loudest of all.",
    language: "en",
    topics: ["pricing", "business", "positioning"],
    authorDisplay: "Lumen School Academy",
    cta: { type: "READ_MORE", destination: "/learn/what-a-price-actually-says" },
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   1. CHATGPT — prepare, preview, explicit publish
   ═══════════════════════════════════════════════════════════════════════════ */

heading("CHATGPT  ·  prepare → preview → explicit publish  →  VibraFlow Media");

const cgDraft = corridor.chatgpt(CHATGPT_PREPARE);
check("the ChatGPT request was accepted", cgDraft.ok, cgDraft.reason || "");
check("it landed as a DRAFT, not a publication", cgDraft.state === "DRAFT");
check("it is NOT publicly visible", corridor.feed().records.length === 0);
console.log(`        record ${cgDraft.record.id} · v${cgDraft.record.version} · presents as ${cgDraft.record.presentationType}`);

const cgPreview = corridor.chatgpt({
  operation: "PREVIEW", instruction_id: "owner-preview-vibraflow-01", record_id: cgDraft.record.id,
});
check("the preview rendered", cgPreview.ok, cgPreview.reason || "");
check("the preview says it is a preview", cgPreview.preview === true && cgPreview.isLive === false);
check("the preview carries BOTH languages", cgPreview.languages.includes("en") && cgPreview.languages.includes("fr"));
check("the preview did not publish anything", corridor.feed().records.length === 0);
console.log(`        EN "${cgPreview.renderings.en.title}"`);
console.log(`        FR "${cgPreview.renderings.fr.title}"`);

const cgEarly = corridor.chatgpt({
  operation: "PUBLISH", instruction_id: "owner-publish-too-soon-01", record_id: cgDraft.record.id,
});
check("publishing WITHOUT Owner approval is refused", cgEarly.ok === false && cgEarly.code === "OWNER_APPROVAL_REQUIRED", cgEarly.reason);

const cgApproval = corridor.approve({ recordId: cgDraft.record.id, by: "OWNER" });
check("the Owner approved it", cgApproval.ok === true, `v${cgApproval.approval && cgApproval.approval.version}`);
check("approval alone is still not publication", corridor.feed().records.length === 0);

const cgPublished = corridor.chatgpt({
  operation: "PUBLISH", instruction_id: "owner-publish-vibraflow-01", record_id: cgDraft.record.id,
});
check("the explicit publish succeeded", cgPublished.ok && cgPublished.state === "PUBLISHED", cgPublished.reason || "");
check("it appears in the VibraFlow Media branch", corridor.feedForBranch("vibraflowmedia").records.length === 1);
check("it appears in NO other branch", ["lumenschoolacademy", "sentinelfortunerecords", "codexworldtv", "lumengame", "lightnodesystems", "oglegacystore"]
  .every((b) => corridor.feedForBranch(b).records.length === 0));

/* ═══════════════════════════════════════════════════════════════════════════
   2. CLAUDE — prepare, preview, explicit publish
   ═══════════════════════════════════════════════════════════════════════════ */

heading("CLAUDE  ·  prepare → preview → explicit publish  →  Lumen School Academy");

const clDraft = corridor.claude(CLAUDE_PREPARE);
check("the Claude request was accepted", clDraft.ok, clDraft.reason || "");
check("it landed as a DRAFT", clDraft.state === "DRAFT");
check("it went through the SAME pipeline step order", clDraft.step === "APPROVAL_STATE");
console.log(`        record ${clDraft.record.id} · v${clDraft.record.version} · presents as ${clDraft.record.presentationType}`);

const clPreview = corridor.claude({
  intent: "PREVIEW", instructionId: "owner-preview-academy-01", recordId: clDraft.record.id,
});
check("the preview rendered", clPreview.ok, clPreview.reason || "");
check("the preview says it is a preview", clPreview.preview === true && clPreview.isLive === false);
check("the preview did not publish anything", corridor.feed().records.length === 1);

corridor.approve({ recordId: clDraft.record.id, by: "OWNER" });
const clPublished = corridor.claude({
  intent: "PUBLISH", instructionId: "owner-publish-academy-01", recordId: clDraft.record.id,
});
check("the explicit publish succeeded", clPublished.ok && clPublished.state === "PUBLISHED", clPublished.reason || "");
check("it appears in the Lumen School Academy branch", corridor.feedForBranch("lumenschoolacademy").records.length === 1);
check("both branches now have exactly one piece each", corridor.feed().records.length === 2);

/* The engine's own ingestion gate accepts both, which is the "one engine"
   claim demonstrated rather than asserted. */
const feedNow = corridor.feed();
for (const [slug, expectedType] of [["vibraflowmedia", "TEACHING"], ["lumenschoolacademy", "COURSE"]]) {
  const { accepted, rejected } = selectPublic(feedNow.records, slug);
  check(`the existing public engine accepts the ${slug} record unchanged`,
    accepted.length === 1 && accepted[0].type === expectedType,
    rejected.filter((r) => r.reason === "NOT_PUBLIC").map((r) => r.problems.join("; ")).join(" | "));
  check(`${slug} shows it as FREE with no price`, accepted[0].pricingTier === "FREE" && accepted[0].price === null);
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. REPLAY — the same two commands again, byte for byte
   ═══════════════════════════════════════════════════════════════════════════ */

heading("REPLAY  ·  both original commands re-sent  →  no duplicate records");

const before = corridor.store.all().length;
const cgReplay = corridor.chatgpt(CHATGPT_PREPARE);
const clReplay = corridor.claude(CLAUDE_PREPARE);
const cgPubReplay = corridor.chatgpt({ operation: "PUBLISH", instruction_id: "owner-publish-vibraflow-01", record_id: cgDraft.record.id });

check("the replayed ChatGPT command was recognised as a replay", cgReplay.replay === true);
check("the replayed Claude command was recognised as a replay", clReplay.replay === true);
check("the replayed PUBLISH was recognised as a replay", cgPubReplay.replay === true);
check("no new records were created", corridor.store.all().length === before, `${before} before, ${corridor.store.all().length} after`);
check("no version was bumped by a replay",
  corridor.store.get(cgDraft.record.id).version === 1 && corridor.store.get(clDraft.record.id).version === 1);
check("the public feed still holds exactly two records", corridor.feed().records.length === 2);
check("the replay returned the ORIGINAL outcome", cgReplay.record.id === cgDraft.record.id);

/* ═══════════════════════════════════════════════════════════════════════════
   4. WITHDRAW — unpublish one, keep everything
   ═══════════════════════════════════════════════════════════════════════════ */

heading("WITHDRAW  ·  unpublish the VibraFlow teaching  →  gone publicly, history intact");

const unapproved = corridor.chatgpt({ operation: "UNPUBLISH", instruction_id: "owner-unpub-no-auth", record_id: cgDraft.record.id });
check("an AI client cannot withdraw on its own authority",
  unapproved.ok === false && unapproved.code === "OWNER_APPROVAL_REQUIRED", unapproved.reason);
check("it is still public", corridor.feedForBranch("vibraflowmedia").records.length === 1);

corridor.authorizeWithdrawal({ recordId: cgDraft.record.id, action: "unpublish", by: "OWNER" });
const withdrawn = corridor.chatgpt({
  operation: "UNPUBLISH", instruction_id: "owner-unpub-vibraflow-01", record_id: cgDraft.record.id,
  user_message: "take the morning teaching down for now",
});
check("the authorized withdrawal succeeded", withdrawn.ok && withdrawn.state === "UNPUBLISHED", withdrawn.reason || "");
check("it has disappeared from the public feed", corridor.feedForBranch("vibraflowmedia").records.length === 0);
check("the Academy lesson is untouched", corridor.feedForBranch("lumenschoolacademy").records.length === 1);

const kept = corridor.store.get(cgDraft.record.id);
check("the record still exists", kept !== null && kept.status === "UNPUBLISHED");
check("its text was NOT deleted", kept.title === CHATGPT_PREPARE.title && kept.body === CHATGPT_PREPARE.body);
check("its French translation was NOT deleted", kept.translations.fr.title === CHATGPT_PREPARE.translations.fr.title);
check("its audit trail survives", Array.isArray(kept.audit) && kept.audit.length > 0, `${kept.audit.length} entries`);
check("it can be previewed again while withdrawn",
  corridor.chatgpt({ operation: "PREVIEW", instruction_id: "owner-preview-after-unpub", record_id: cgDraft.record.id }).ok === true);

/* ═══════════════════════════════════════════════════════════════════════════
   The artefact
   ═══════════════════════════════════════════════════════════════════════════ */

heading("OUTPUT  ·  the public editorial feed");

const feed = corridor.feed({ evidence: "TEST_PREVIEW" });
mkdirSync(dirname(FEED_PATH), { recursive: true });
writeFileSync(FEED_PATH, `${JSON.stringify(feed, null, 2)}\n`);

check("the feed uses the engine's EXISTING envelope", feed.schema === "sf.public-site/1.0");
check('the feed is marked evidence "TEST_PREVIEW"', feed.evidence === "TEST_PREVIEW");
check("the feed contains only what is still published", feed.records.length === 1);

const FORBIDDEN = ["audit", "revisionHistory", "rights", "sourceClient", "ownerInstructionId", "ownerApproval", "status", "price", "compareAtPrice", "checkoutUrl", "body"];
const leaked = feed.records.flatMap((r) => FORBIDDEN.filter((k) => k in r));
check("no governing, private or commercial key reached the feed", leaked.length === 0, leaked.join(", "));

console.log(`\n        written to ${FEED_PATH}`);
console.log(`        audit trail: ${corridor.auditTrail().length} entries across ${corridor.store.all().length} records`);

console.log(`\n${"═".repeat(74)}`);
console.log(failures === 0
  ? "ACCEPTANCE: all checks passed."
  : `ACCEPTANCE: ${failures} check(s) FAILED.`);
console.log("═".repeat(74));
process.exit(failures === 0 ? 0 : 1);
