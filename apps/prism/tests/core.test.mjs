// Unit tests for the parts that decide things: the router, the project schema,
// persistence and export. Run with `node --test`.
//
// These run in plain Node with no DOM and no browser, which is possible because
// every module under test takes its storage as an argument rather than reaching
// for a global. The browser-only paths are covered by the Playwright suite.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DIMENSIONS, DIMENSION_IDS, getDimension, isSensitive } from "../js/dimensions.js";
import { recommend, scoreGoal, ROUTER_CONSTANTS } from "../js/router.js";
import {
  createProject, createRepo, memoryStorage, normaliseProject, dimensionStatus,
  projectProgress, validateGoal, validateProjectName, coerceField, LIMITS,
} from "../js/store.js";
import { buildSummary, toHTML, toJSON, suggestFilename } from "../js/export.js";

describe("dimensions", () => {
  test("there are exactly seven, each with a distinct id", () => {
    assert.equal(DIMENSIONS.length, 7);
    assert.equal(new Set(DIMENSION_IDS).size, 7);
  });

  test("every dimension has at least one required field, or it can never complete", () => {
    for (const d of DIMENSIONS) {
      assert.ok(d.fields.some((f) => f.required), `${d.id} has no required field`);
    }
  });

  test("only VibraFlow is marked sensitive", () => {
    assert.equal(isSensitive("vibraflow"), true);
    for (const id of DIMENSION_IDS.filter((x) => x !== "vibraflow")) {
      assert.equal(isSensitive(id), false, `${id} should not be sensitive`);
    }
  });
});

describe("router", () => {
  const cases = [
    ["I want to release my new album and get it to listeners", "records"],
    ["Build a 30 day challenge to keep my members engaged", "lumengame"],
    ["I feel stuck and want clarity on my purpose before I commit", "vibraflow"],
    ["I need to structure the story for a documentary series", "codexworld"],
    ["Teach a masterclass on entrepreneurship to new founders", "lumenschool"],
    ["Automate my onboarding process so it is repeatable", "lightnode"],
    ["Package my templates into a bundle I can sell", "oglegacy"],
  ];
  for (const [goal, expected] of cases) {
    test(`"${goal.slice(0, 34)}…" routes to ${expected}`, () => {
      const ids = recommend(goal).recommended.map((r) => r.id);
      assert.ok(ids.includes(expected), `expected ${expected}, got ${ids.join(", ")}`);
    });
  }

  test("a multi-part goal returns several dimensions, not one", () => {
    const ids = recommend(
      "I want to turn my expertise into a course I can sell, with a workflow to deliver it",
    ).recommended.map((r) => r.id);
    assert.ok(ids.length >= 2);
    assert.ok(ids.includes("lumenschool"));
    assert.ok(ids.includes("oglegacy"));
  });

  test("never returns more than the cap, so the answer stays a shortlist", () => {
    const busy = "album game reflection story course workflow offer sell automate challenge journal";
    assert.ok(recommend(busy).recommended.length <= ROUTER_CONSTANTS.MAX_RECOMMENDED);
  });

  test("an unmatched goal still returns a usable starting pair", () => {
    const r = recommend("qqq zzz wwww");
    assert.equal(r.matched, false);
    assert.equal(r.recommended.length, ROUTER_CONSTANTS.MIN_RECOMMENDED);
    for (const x of r.recommended) assert.ok(x.reason.length > 10);
  });

  test("empty input does not throw", () => {
    for (const v of ["", null, undefined, "   "]) {
      assert.ok(recommend(v).recommended.length >= ROUTER_CONSTANTS.MIN_RECOMMENDED);
    }
  });

  test("every recommendation carries a human reason", () => {
    for (const r of recommend("sell a course about automation").recommended) {
      assert.equal(typeof r.reason, "string");
      assert.ok(r.reason.length > 10);
    }
  });

  test("is deterministic — same input, same output", () => {
    const g = "release an album and sell a merch bundle";
    assert.deepEqual(recommend(g), recommend(g));
  });

  test("word-boundary matching does not fire on unrelated substrings", () => {
    // "scoreboard" contains "score" but must not register as a games signal,
    // and "recorded" must not be treated as "record" the noun.
    const s = scoreGoal("the scoreboard was unrecorded");
    assert.equal(s.raw.lumengame, 0);
  });
});

describe("validation", () => {
  test("rejects an empty project name and an over-long one", () => {
    assert.equal(validateProjectName("").ok, false);
    assert.equal(validateProjectName("   ").ok, false);
    assert.equal(validateProjectName("x".repeat(LIMITS.projectName + 1)).ok, false);
    assert.equal(validateProjectName(" Good name ").value, "Good name");
  });

  test("rejects a goal too short for the router to use", () => {
    assert.equal(validateGoal("help").ok, false);
    assert.equal(validateGoal("I want to sell my toolkits online").ok, true);
  });

  test("coerceField clamps length and drops blank list rows", () => {
    const f = { type: "list", max: 10 };
    assert.deepEqual(coerceField(f, ["  a  ", "", "   ", "b"]), ["a", "b"]);
    assert.deepEqual(coerceField(f, ["abcdefghijklmno"]), ["abcdefghij"]);
    const t = { type: "text", max: 5 };
    assert.equal(coerceField(t, "  abcdefgh "), "abcde");
  });
});

describe("project state", () => {
  test("a dimension is complete only when every required field is filled", () => {
    assert.equal(dimensionStatus("lightnode", {}).state, "empty");
    assert.equal(dimensionStatus("lightnode", { processName: "Onboarding" }).state, "started");
    assert.equal(
      dimensionStatus("lightnode", {
        processName: "Onboarding", trigger: "New client signs", steps: ["Send welcome"],
      }).state,
      "complete",
    );
  });

  test("an empty list does not count as a filled required field", () => {
    const s = dimensionStatus("lightnode", { processName: "X", trigger: "Y", steps: [] });
    assert.equal(s.state, "started");
  });

  test("progress counts only selected dimensions", () => {
    const p = createProject({ name: "P", goal: "g", selected: ["lightnode", "oglegacy"] });
    p.data.lightnode = { processName: "A", trigger: "B", steps: ["C"] };
    const prog = projectProgress(p);
    assert.deepEqual([prog.complete, prog.total, prog.percent], [1, 2, 50]);
  });

  test("createProject drops unknown dimension ids", () => {
    const p = createProject({ name: "P", goal: "g", selected: ["lightnode", "not-real"] });
    assert.deepEqual(p.selected, ["lightnode"]);
  });

  test("normaliseProject repairs corrupt input instead of throwing", () => {
    const p = normaliseProject({ name: 42, selected: "nope", data: "nope" });
    assert.equal(typeof p.name, "string");
    assert.deepEqual(p.selected, []);
    assert.deepEqual(p.data, {});
    assert.equal(normaliseProject(null), null);
  });

  test("normaliseProject strips fields that belong to no dimension", () => {
    const p = normaliseProject({
      name: "P", goal: "g", selected: ["oglegacy"],
      data: { oglegacy: { offerName: "Kit", injected: "<script>" } },
    });
    assert.equal(p.data.oglegacy.offerName, "Kit");
    assert.equal(p.data.oglegacy.injected, undefined);
  });
});

describe("persistence", () => {
  test("saves, reloads and resumes a project", () => {
    const store = memoryStorage();
    const repo = createRepo(store);
    const saved = repo.save(createProject({ name: "Trade Kit", goal: "sell my templates", selected: ["oglegacy"] }));

    // A fresh repo over the same storage is what a page reload looks like.
    const reloaded = createRepo(store).get(saved.id);
    assert.equal(reloaded.name, "Trade Kit");
    assert.deepEqual(reloaded.selected, ["oglegacy"]);
  });

  test("updating a project does not create a duplicate", () => {
    const repo = createRepo(memoryStorage());
    const p = repo.save(createProject({ name: "A", goal: "g", selected: [] }));
    p.name = "B";
    repo.save(p);
    const all = repo.list();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, "B");
  });

  test("a corrupt store yields an empty list rather than an exception", () => {
    const store = memoryStorage();
    store.setItem("sentinel.prism.projects.v1", "{not json");
    assert.deepEqual(createRepo(store).list(), []);
  });

  test("delete removes only the target", () => {
    const repo = createRepo(memoryStorage());
    const a = repo.save(createProject({ name: "A", goal: "g", selected: [] }));
    const b = repo.save(createProject({ name: "B", goal: "g", selected: [] }));
    repo.remove(a.id);
    assert.deepEqual(repo.list().map((x) => x.name), ["B"]);
    assert.ok(repo.get(b.id));
  });
});

describe("export", () => {
  function filled() {
    const p = createProject({ name: "Trade Kit", goal: "Turn my expertise into an offer", selected: ["lumenschool", "oglegacy"] });
    p.data.lumenschool = { skillGoal: "Package what I know", modules: ["Audience", "Outline"], firstAction: "Draft the outline" };
    p.data.oglegacy = { offerName: "Trade Ops Kit", promise: "Run the back office in an hour a week", components: ["Checklists", "Templates"] };
    return p;
  }

  test("summary includes only dimensions with real content", () => {
    const p = filled();
    p.selected.push("records"); // selected but never filled in
    const s = buildSummary(p);
    assert.deepEqual(s.sections.map((x) => x.id), ["lumenschool", "oglegacy"]);
  });

  test("JSON round-trips into an equivalent project", () => {
    const p = filled();
    const back = JSON.parse(toJSON(p)).project;
    assert.equal(back.name, p.name);
    assert.deepEqual(back.data.oglegacy.components, ["Checklists", "Templates"]);
  });

  test("HTML export contains the goal and every filled section", () => {
    const html = toHTML(filled());
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes("Turn my expertise into an offer"));
    assert.ok(html.includes("Lumen School Academy"));
    assert.ok(html.includes("Trade Ops Kit"));
    assert.ok(!html.includes("Sentinel Fortune Records"), "unfilled dimension must not appear");
  });

  test("HTML export escapes user content — no injection through a project field", () => {
    const p = filled();
    p.name = '<img src=x onerror="alert(1)">';
    p.data.oglegacy.offerName = "</style><script>alert(2)</script>";
    const html = toHTML(p);
    assert.ok(!html.includes("<img src=x"), "raw tag leaked into export");
    assert.ok(!html.includes("<script>alert(2)"), "raw script leaked into export");
    assert.ok(html.includes("&lt;img"), "expected the tag to be escaped");
  });

  test("an empty project still exports a valid document rather than failing", () => {
    const p = createProject({ name: "Empty", goal: "nothing yet at all", selected: ["records"] });
    const html = toHTML(p);
    assert.ok(html.includes("No dimension has content yet"));
  });

  test("filenames are safe and dated", () => {
    const p = createProject({ name: "My  Project!! / 2026", goal: "g", selected: [] });
    const f = suggestFilename(p, "html");
    assert.match(f, /^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.html$/);
  });
});
