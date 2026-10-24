/* Sentinel Fortune — PREMIUM VISUAL LAYER.
 *
 * The seven houses must look launchable, not like a developer interface. This
 * module is the only place visual artwork is produced, and it exists because
 * of one hard constraint:
 *
 *   GOVERNED IMAGERY IS OFTEN ABSENT, AND INVENTING A MEDIA URL IS FORBIDDEN.
 *
 * So the fallback cannot be a grey box. It is deterministic generated artwork —
 * real SVG, drawn from the record's own slug and its branch's visual grammar.
 * The same record always draws the same art, so nothing flickers between loads
 * and nothing is random.
 *
 * It is honestly generated rather than pretending to be photography: a record
 * label's placeholder sleeve reads as a designed sleeve, not as a missing
 * image. When governed imagery arrives it simply takes over.
 *
 * WHY INLINE SVG RATHER THAN AN <img> DATA URI
 * --------------------------------------------
 * Inline SVG inherits the branch's theme tokens, so artwork recolours with the
 * world it sits in; it costs no request; it cannot 404; and it has no decode
 * step, so there is no layout shift. A data URI would lose all four.
 *
 * LEGIBILITY AT CARD SIZE is the governing design rule. A card thumbnail is
 * small, so every grammar below is ONE focal form with high contrast and no
 * fine detail — the thing that survives being shrunk.
 */

import { h } from "./ui.js";

/* ─────────────────────────────────────────────────────────────────────────
   DETERMINISM
   ───────────────────────────────────────────────────────────────────────── */

/** FNV-1a. Small, fast, and stable across runs — which is the only property
 *  that matters here: the same slug must always draw the same artwork. */
function hash(str) {
  let hv = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hv ^= str.charCodeAt(i);
    hv = Math.imul(hv, 0x01000193) >>> 0;
  }
  return hv >>> 0;
}

/** A seeded generator, so each artwork's variation is reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 0xffffffff;
  };
}

const svgNS = "http://www.w3.org/2000/svg";

function el(tag, attrs) {
  const node = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
  return node;
}

/** The two initials a monogram uses. Deliberately derived from the title, so a
 *  generated sleeve still says which thing it belongs to. */
function initials(title) {
  const words = String(title).replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
  if (!words.length || !words[0]) return "SF";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ─────────────────────────────────────────────────────────────────────────
   THE SEVEN VISUAL GRAMMARS
   ───────────────────────────────────────────────────────────────────────── */
/* Each takes an <svg>, a seeded random and the record, and draws ONE focal
   form. `currentColor` and the theme variables do the colouring, so the same
   grammar reads correctly in every world it is used in.                      */

const GRAMMAR = {

  /* Records — a sleeve. Concentric arcs read as a record at any size. */
  sentinelfortunerecords(svg, rnd, record) {
    const cx = 50, cy = 50;
    for (let i = 0; i < 5; i++) {
      svg.appendChild(el("circle", {
        cx, cy, r: 13 + i * 7.5,
        fill: "none", stroke: "var(--accent)",
        "stroke-width": i === 0 ? 1.6 : 0.5,
        opacity: (0.85 - i * 0.14).toFixed(2),
      }));
    }
    svg.appendChild(el("circle", { cx, cy, r: 4.5, fill: "var(--accent)" }));
    /* A short waveform across the lower third — the audio cue. */
    let d = "M 8 78";
    for (let x = 8; x <= 92; x += 4) {
      d += ` L ${x} ${(78 + (rnd() - 0.5) * 16).toFixed(1)}`;
    }
    svg.appendChild(el("path", { d, fill: "none", stroke: "var(--accent)", "stroke-width": 0.8, opacity: ".5" }));
  },

  /* Codex World TV — key art. Letterboxed bars and one rising horizon. */
  codexworldtv(svg, rnd) {
    svg.appendChild(el("rect", { x: 0, y: 0, width: 100, height: 11, fill: "var(--accent)", opacity: ".1" }));
    svg.appendChild(el("rect", { x: 0, y: 89, width: 100, height: 11, fill: "var(--accent)", opacity: ".1" }));
    const horizon = 56 + rnd() * 10;
    svg.appendChild(el("path", {
      d: `M 0 ${horizon} L 100 ${horizon - 6 + rnd() * 12}`,
      stroke: "var(--accent)", "stroke-width": 1.2, fill: "none", opacity: ".8",
    }));
    /* Three receding panels — the poster stack. */
    for (let i = 0; i < 3; i++) {
      svg.appendChild(el("rect", {
        x: 24 + i * 9, y: 24 + i * 4, width: 30, height: 44 - i * 6,
        fill: "none", stroke: "var(--accent)", "stroke-width": 0.6,
        opacity: (0.7 - i * 0.2).toFixed(2),
      }));
    }
  },

  /* Lumen Game — angular energy. One bold shard, high contrast. */
  lumengame(svg, rnd) {
    const pts = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 34 : 17 + rnd() * 8;
      pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
    }
    svg.appendChild(el("polygon", { points: pts.join(" "), fill: "var(--accent)", opacity: ".16" }));
    svg.appendChild(el("polygon", { points: pts.join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 1.4 }));
    for (let i = 0; i < 3; i++) {
      svg.appendChild(el("line", {
        x1: 6, y1: 16 + i * 30, x2: 20 + rnd() * 14, y2: 16 + i * 30,
        stroke: "var(--accent)", "stroke-width": 1, opacity: ".45",
      }));
    }
  },

  /* Lumen School Academy — an ascending measure. Structure and progress. */
  lumenschoolacademy(svg, rnd) {
    for (let i = 0; i < 5; i++) {
      const hgt = 14 + i * 11 + rnd() * 5;
      svg.appendChild(el("rect", {
        x: 16 + i * 14, y: 80 - hgt, width: 8, height: hgt,
        fill: "var(--accent)", opacity: (0.22 + i * 0.14).toFixed(2),
      }));
    }
    svg.appendChild(el("line", { x1: 8, y1: 80, x2: 92, y2: 80, stroke: "var(--accent)", "stroke-width": 1, opacity: ".7" }));
    svg.appendChild(el("path", {
      d: "M 14 34 L 30 26 L 46 30 L 62 18 L 80 22",
      fill: "none", stroke: "var(--accent)", "stroke-width": 1.3, opacity: ".85",
    }));
  },

  /* VibraFlow Media — a soft field and a single horizon. Restraint. */
  vibraflowmedia(svg, rnd, record, id) {
    const g = el("radialGradient", { id: `vf-${id}`, cx: "50%", cy: "38%", r: "62%" });
    g.appendChild(el("stop", { offset: "0%", "stop-color": "var(--accent)", "stop-opacity": ".22" }));
    g.appendChild(el("stop", { offset: "100%", "stop-color": "var(--accent)", "stop-opacity": "0" }));
    const defs = el("defs", {});
    defs.appendChild(g);
    svg.appendChild(defs);
    svg.appendChild(el("rect", { x: 0, y: 0, width: 100, height: 100, fill: `url(#vf-${id})` }));
    for (let i = 0; i < 3; i++) {
      svg.appendChild(el("line", {
        x1: 16, y1: 62 + i * 9, x2: 84, y2: 62 + i * 9,
        stroke: "var(--accent)", "stroke-width": 0.5, opacity: (0.5 - i * 0.14).toFixed(2),
      }));
    }
    svg.appendChild(el("circle", { cx: 50, cy: 38, r: 10 + rnd() * 3, fill: "none", stroke: "var(--accent)", "stroke-width": 0.9, opacity: ".7" }));
  },

  /* LightNode Systems — a schematic. Nodes and the edges between them. */
  lightnodesystems(svg, rnd) {
    const nodes = [];
    for (let i = 0; i < 5; i++) nodes.push({ x: 18 + rnd() * 64, y: 20 + rnd() * 58 });
    for (let i = 0; i < nodes.length - 1; i++) {
      svg.appendChild(el("line", {
        x1: nodes[i].x.toFixed(1), y1: nodes[i].y.toFixed(1),
        x2: nodes[i + 1].x.toFixed(1), y2: nodes[i + 1].y.toFixed(1),
        stroke: "var(--accent)", "stroke-width": 0.7, opacity: ".55",
      }));
    }
    for (const n of nodes) {
      svg.appendChild(el("circle", { cx: n.x.toFixed(1), cy: n.y.toFixed(1), r: 3.4, fill: "var(--bg)", stroke: "var(--accent)", "stroke-width": 1.2 }));
    }
    svg.appendChild(el("rect", { x: 10, y: 10, width: 80, height: 80, fill: "none", stroke: "var(--accent)", "stroke-width": 0.4, opacity: ".3", "stroke-dasharray": "3 3" }));
  },

  /* OG Legacy Store — a monogram in a frame. Boutique, not inventory. */
  oglegacystore(svg, rnd, record) {
    svg.appendChild(el("rect", { x: 9, y: 9, width: 82, height: 82, fill: "none", stroke: "var(--accent)", "stroke-width": 0.9, opacity: ".65" }));
    svg.appendChild(el("rect", { x: 14, y: 14, width: 72, height: 72, fill: "none", stroke: "var(--accent)", "stroke-width": 0.3, opacity: ".4" }));
    const t = el("text", {
      x: 50, y: 50, "text-anchor": "middle", "dominant-baseline": "central",
      fill: "var(--accent)", "font-family": "Cinzel, Georgia, serif",
      "font-size": 30, "letter-spacing": 2, opacity: ".9",
    });
    t.textContent = initials(record.title);
    svg.appendChild(t);
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   PUBLIC API
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Generated artwork for a record, as an inline SVG element.
 *
 * `aria-hidden` and `role="presentation"`: it carries no information a screen
 * reader needs — the title beside it already says what this is, and announcing
 * "generated artwork" would be noise.
 */
export function generatedArt(record, identity, { ratio = "3 / 2", salt = "" } = {}) {
  /* `salt` lets one record carry several DIFFERENT generated artworks — which
     is what makes the three publication roles visually distinct without three
     real image files existing. Same record + same salt is always the same
     artwork, so nothing shimmers between renders. */
  const seed = hash(`${identity}:${record.slug}${salt ? `:${salt}` : ""}`);
  const rnd = rng(seed);
  const svg = el("svg", {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "xMidYMid slice",
    role: "presentation",
    "aria-hidden": "true",
    class: "sf-art",
  });
  svg.style.aspectRatio = ratio;

  const draw = GRAMMAR[identity];
  if (draw) draw(svg, rnd, record, seed.toString(36));
  return svg;
}

/**
 * The one media component. Every image on the seven houses comes from here.
 *
 *   governed IMAGE present  -> a real <img>, lazily loaded below the fold,
 *                              with explicit dimensions so nothing shifts,
 *                              and an error handler that swaps in generated
 *                              art rather than leaving a broken frame
 *   no governed IMAGE       -> generated art directly
 *
 * There is no third outcome, which is how "never show a broken image" and
 * "never expose a raw placeholder" are both guaranteed structurally rather
 * than by remembering to check.
 */
export function cover(record, identity, { ratio = "3 / 2", eager = false, width = 600, height = 400 } = {}) {
  const governed = record.media.find((m) => m.kind === "IMAGE");
  const frame = h("div.sf-cover", { dataset: { generated: governed ? "false" : "true" } });
  frame.style.aspectRatio = ratio;

  if (!governed) {
    frame.appendChild(generatedArt(record, identity, { ratio }));
    return frame;
  }

  const img = h("img.sf-cover-img", {
    src: governed.src,
    alt: governed.alt || "",
    width, height,
    loading: eager ? "eager" : "lazy",
    decoding: "async",
    fetchpriority: eager ? "high" : null,
  });
  /* A governed URL can still fail — the asset may have moved. Falling back to
     generated art keeps the page premium instead of showing a torn frame. */
  img.addEventListener("error", () => {
    frame.dataset.generated = "fallback";
    frame.replaceChildren(generatedArt(record, identity, { ratio }));
  }, { once: true });

  frame.appendChild(img);
  return frame;
}

/**
 * The hero backdrop for a branch home.
 *
 * Deliberately NOT the same artwork as any card: the Steam finding — that the
 * screen below a header should add information rather than repeat the art —
 * applies to a hero too. This is atmosphere, drawn from the branch itself, at
 * low contrast so the headline stays the thing you read first.
 */
export function heroBackdrop(identity) {
  const seed = hash(`hero:${identity}`);
  const rnd = rng(seed);
  const svg = el("svg", {
    viewBox: "0 0 160 90", preserveAspectRatio: "xMidYMid slice",
    role: "presentation", "aria-hidden": "true", class: "sf-hero-art",
  });

  switch (identity) {
    case "sentinelfortunerecords": {
      for (let i = 0; i < 7; i++) {
        svg.appendChild(el("circle", {
          cx: 132, cy: 30, r: 12 + i * 9, fill: "none",
          stroke: "var(--accent)", "stroke-width": 0.4, opacity: (0.4 - i * 0.045).toFixed(3),
        }));
      }
      break;
    }
    case "codexworldtv": {
      for (let i = 0; i < 5; i++) {
        svg.appendChild(el("rect", {
          x: 96 + i * 13, y: 18 + i * 5, width: 26, height: 54 - i * 7,
          fill: "none", stroke: "var(--accent)", "stroke-width": 0.35, opacity: (0.35 - i * 0.055).toFixed(3),
        }));
      }
      break;
    }
    case "lumengame": {
      for (let i = 0; i < 9; i++) {
        const x = 90 + rnd() * 66, y = rnd() * 90;
        svg.appendChild(el("polygon", {
          points: `${x},${y} ${x + 7},${y + 4} ${x + 2},${y + 10}`,
          fill: "var(--accent)", opacity: (0.08 + rnd() * 0.14).toFixed(3),
        }));
      }
      break;
    }
    case "lumenschoolacademy": {
      for (let i = 0; i < 9; i++) {
        svg.appendChild(el("rect", {
          x: 92 + i * 7.5, y: 74 - i * 6.5, width: 4, height: 6 + i * 6.5,
          fill: "var(--accent)", opacity: (0.07 + i * 0.022).toFixed(3),
        }));
      }
      break;
    }
    case "vibraflowmedia": {
      for (let i = 0; i < 9; i++) {
        svg.appendChild(el("line", {
          x1: 0, y1: 20 + i * 7, x2: 160, y2: 22 + i * 7,
          stroke: "var(--accent)", "stroke-width": 0.3, opacity: (0.3 - i * 0.03).toFixed(3),
        }));
      }
      break;
    }
    case "lightnodesystems": {
      const pts = [];
      for (let i = 0; i < 9; i++) pts.push({ x: 86 + rnd() * 70, y: 8 + rnd() * 74 });
      pts.forEach((p, i) => {
        if (i) svg.appendChild(el("line", {
          x1: pts[i - 1].x.toFixed(1), y1: pts[i - 1].y.toFixed(1),
          x2: p.x.toFixed(1), y2: p.y.toFixed(1),
          stroke: "var(--accent)", "stroke-width": 0.3, opacity: ".26",
        }));
        svg.appendChild(el("circle", { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 1.5, fill: "var(--accent)", opacity: ".4" }));
      });
      break;
    }
    case "oglegacystore": {
      for (let i = 0; i < 3; i++) {
        svg.appendChild(el("rect", {
          x: 100 + i * 7, y: 14 + i * 7, width: 46 - i * 14, height: 62 - i * 14,
          fill: "none", stroke: "var(--accent)", "stroke-width": 0.35, opacity: (0.34 - i * 0.09).toFixed(3),
        }));
      }
      break;
    }
    /* The company, not an eighth world. Seven arcs converging on one point:
       the only grammar here that is about the whole rather than a part, and
       deliberately the calmest of the eight so the headline stays dominant. */
    case "sentinelfortune": {
      for (let i = 0; i < 7; i++) {
        const spread = 10 + i * 6;
        svg.appendChild(el("path", {
          d: `M${118 - spread} 90 Q ${128} ${46 - i * 3} ${118 + spread} 0`,
          fill: "none", stroke: "var(--accent)", "stroke-width": 0.35,
          opacity: (0.30 - i * 0.032).toFixed(3),
        }));
      }
      svg.appendChild(el("circle", { cx: 128, cy: 45, r: 1.6, fill: "var(--accent)", opacity: ".45" }));
      break;
    }
    default: break;
  }
  return svg;
}

/** True when this record has governed imagery. Used by the detail renderers to
 *  decide whether to give an image the dominant share of the screen. */
export function hasGovernedImage(record) {
  return record.media.some((m) => m.kind === "IMAGE");
}

/* ─────────────────────────────────────────────────────────────────────────
   THE THREE PUBLICATION ROLES

   Every important editorial release supports three media roles, reusable
   across Latest, a world's home, a category, the Featured rail, related
   content and a share preview:

     ATTENTION  the cover that earns a look
     VALUE      the human or real-use scene that says why this matters
     DISCOVERY  the collection visual that invites going deeper

   WHAT THIS DOES AND DOES NOT PROMISE.
   It resolves a role to the governed image for that role when House of Assets
   has supplied one. When it has not, it returns deterministic generated
   artwork salted by the role — so the three slots are genuinely three
   different visuals rather than the same picture three times, and no path to a
   non-existent file is ever emitted. Generated art is a designed premium
   fallback, not a stand-in for photography: real imagery of people and real
   use is Owner content, and its absence is visible as abstraction rather than
   as a broken frame.
   ───────────────────────────────────────────────────────────────────────── */

export const MEDIA_ROLES = Object.freeze(["ATTENTION", "VALUE", "DISCOVERY"]);

/** The governed image for one role, or null. */
export function governedRole(record, role) {
  return (record.media || []).find((m) => m.kind === "IMAGE" && m.role === role) || null;
}

/**
 * One role's visual, as a framed element.
 *
 * Falls back, in order: the role's own governed image → any governed image
 * (ATTENTION only, since a single supplied cover is an attention image) →
 * generated art salted by the role.
 */
export function roleCover(record, identity, role, { ratio = "3 / 2", eager = false, width = 600, height = 400 } = {}) {
  if (!MEDIA_ROLES.includes(role)) throw new Error(`roleCover: unknown role ${JSON.stringify(role)}`);

  const governed = governedRole(record, role)
    || (role === "ATTENTION" ? (record.media || []).find((m) => m.kind === "IMAGE" && !m.role) : null);

  if (governed) {
    /* Reuse the one media component by handing it a record whose only image is
       this role's, so the error-to-generated-art guarantee still applies. */
    return cover({ ...record, media: [governed] }, identity, { ratio, eager, width, height });
  }

  const frame = h("div.sf-cover", { dataset: { generated: "true", role } });
  frame.style.aspectRatio = ratio;
  frame.appendChild(generatedArt(record, identity, { ratio, salt: role }));
  return frame;
}

/** Which roles this record can actually present, governed or generated. Every
 *  record can present all three; this reports which are REAL imagery. */
export function governedRoles(record) {
  return MEDIA_ROLES.filter((role) => Boolean(governedRole(record, role)));
}
