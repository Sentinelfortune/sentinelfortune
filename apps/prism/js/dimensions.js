// The seven dimensions.
//
// Each one does exactly one job. The temptation here is to build seven
// applications; that produces seven abandoned tabs. What makes this a product
// rather than a bundle is that every dimension writes into the same project and
// contributes one section to one plan.
//
// A dimension is data, not code: an id, the job it does, and the fields it
// collects. The workspace renders any dimension from this description alone, so
// adding an eighth would be an entry here and nothing else.
//
// Field types: "text" (single line), "long" (textarea), "date", "list"
// (repeatable single lines). `required` fields gate a dimension's "complete"
// status; nothing else blocks the user.

export const DIMENSIONS = [
  {
    id: "records",
    name: "Sentinel Fortune Records",
    short: "Records",
    job: "Plan a release",
    blurb: "Music, audio and creator operations. Turns a finished or planned work into a dated release sequence.",
    accent: "#c8a84b",
    fields: [
      { key: "workTitle", label: "What is the work called?", type: "text", required: true, max: 120,
        hint: "Working title is fine." },
      { key: "format", label: "Format", type: "text", max: 80,
        hint: "Single, EP, album, podcast season, audio course…" },
      { key: "audience", label: "Who is it for?", type: "text", max: 200 },
      { key: "releaseDate", label: "Target release date", type: "date" },
      { key: "milestones", label: "Steps before release", type: "list", required: true, max: 160,
        hint: "Master, artwork, metadata, pre-save, announcement…" },
    ],
  },
  {
    id: "lumengame",
    name: "LumenGame",
    short: "LumenGame",
    job: "Build a challenge",
    blurb: "Games, interaction and gamified engagement. Turns a passive audience into people who do something.",
    accent: "#6fbf8e",
    fields: [
      { key: "challengeName", label: "Challenge name", type: "text", required: true, max: 120 },
      { key: "objective", label: "What should someone achieve by the end?", type: "long", required: true, max: 600 },
      { key: "steps", label: "Steps or levels", type: "list", required: true, max: 160,
        hint: "One line per step. Keep each one completable in a sitting." },
      { key: "reward", label: "What do they get for finishing?", type: "text", max: 200,
        hint: "Recognition, a resource, access — anything real you can actually deliver." },
    ],
  },
  {
    id: "vibraflow",
    name: "VibraFlow Media",
    short: "VibraFlow",
    job: "Work through a reflection",
    blurb: "Reflection and inner development. A structured journal for the questions underneath the work. General and educational — not therapy, and not a substitute for professional care.",
    accent: "#9b8ec4",
    sensitive: true,
    fields: [
      { key: "focus", label: "What are you sitting with?", type: "text", required: true, max: 200 },
      { key: "why", label: "Why does this matter to you?", type: "long", max: 1200 },
      { key: "resistance", label: "What makes it hard?", type: "long", max: 1200 },
      { key: "values", label: "Values this touches", type: "list", max: 120 },
      { key: "next", label: "One honest next step", type: "text", max: 300 },
    ],
  },
  {
    id: "codexworld",
    name: "CodexWorld TV",
    short: "CodexWorld",
    job: "Structure the story",
    blurb: "Storytelling, narrative and visual knowledge. Gives a message a shape someone can follow.",
    accent: "#d98b6a",
    fields: [
      { key: "premise", label: "In one sentence, what is this about?", type: "long", required: true, max: 400 },
      { key: "audience", label: "Who is watching or reading?", type: "text", max: 200 },
      { key: "setup", label: "Setup — where do they start?", type: "long", required: true, max: 800 },
      { key: "turn", label: "Turn — what changes?", type: "long", required: true, max: 800 },
      { key: "landing", label: "Landing — where do they end up?", type: "long", required: true, max: 800 },
    ],
  },
  {
    id: "lumenschool",
    name: "Lumen School Academy",
    short: "Lumen School",
    job: "Plan the learning and the first action",
    blurb: "Business, entrepreneurship and AI education. Turns an intention into a sequence with a first move. Educational only — not personalised financial, investment, tax or legal advice.",
    accent: "#6fa8d9",
    fields: [
      { key: "skillGoal", label: "What do you need to be able to do?", type: "long", required: true, max: 600 },
      { key: "level", label: "Where are you now?", type: "text", max: 200,
        hint: "Honest starting point — it changes the sequence." },
      { key: "modules", label: "Learning sequence", type: "list", required: true, max: 160,
        hint: "One line per block, in order." },
      { key: "firstAction", label: "First action you can take this week", type: "text", required: true, max: 300 },
      { key: "evidence", label: "How will you know it worked?", type: "text", max: 300 },
    ],
  },
  {
    id: "lightnode",
    name: "LightNode Systems",
    short: "LightNode",
    job: "Write the workflow",
    blurb: "Software, operations and automation. Turns something you do from memory into something repeatable.",
    accent: "#7fc7c7",
    fields: [
      { key: "processName", label: "What is this process called?", type: "text", required: true, max: 120 },
      { key: "trigger", label: "What starts it?", type: "text", required: true, max: 300 },
      { key: "steps", label: "Steps, in order", type: "list", required: true, max: 200,
        hint: "One action per line. Write it so someone else could run it." },
      { key: "owner", label: "Who runs it?", type: "text", max: 160 },
      { key: "done", label: "How do you know it is finished?", type: "text", max: 300 },
    ],
  },
  {
    id: "oglegacy",
    name: "OG Legacy Store",
    short: "OG Legacy",
    job: "Shape the offer",
    blurb: "Commerce, offers and packaging. Turns work into something someone can actually buy.",
    accent: "#d9736a",
    fields: [
      { key: "offerName", label: "Offer name", type: "text", required: true, max: 120 },
      { key: "promise", label: "What does the buyer get out of it?", type: "long", required: true, max: 600,
        hint: "The outcome, not the file list." },
      { key: "components", label: "What is included", type: "list", required: true, max: 200 },
      { key: "buyer", label: "Who is it for?", type: "text", max: 200 },
      { key: "priceIdea", label: "Price you are considering", type: "text", max: 80,
        hint: "A number to react to. Nothing is charged here." },
    ],
  },
];

export const DIMENSION_IDS = DIMENSIONS.map((d) => d.id);

const BY_ID = new Map(DIMENSIONS.map((d) => [d.id, d]));

export function getDimension(id) {
  return BY_ID.get(id) ?? null;
}

/** Dimensions carrying content a person would not want casually exposed. */
export function isSensitive(id) {
  return Boolean(BY_ID.get(id)?.sensitive);
}
