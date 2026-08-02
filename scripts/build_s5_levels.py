#!/usr/bin/env python3
"""
Generate and verify the S.5 ASCENT level set.

The old levels were hand-written JSON: five vertical towers with the same
zig-zag shape, 120 px apart, differing only in which platforms were traps. The
jump arc cleared 144 px, so every gap passed by 24 px — playable, but only
just, and identical fifteen times over.

Levels are authored here instead, for one reason: the reachability constraints
live in the same file as the geometry, so a level that cannot be completed
cannot be written out. The numbers below MUST match the constants in game.js.

Checks performed before anything is emitted:
  * every same-height gap is within the measured jump distance
  * every step up is within the measured jump height
  * no platform overlaps another
  * every orb sits within reach of a surface
  * the goal sits on a surface
  * no spike is placed where the only route requires standing
  * checkpoints sit on surfaces
  * the player spawns on solid ground

Usage:  python3 scripts/build_s5_levels.py [--check]
        --check verifies without writing (used by validation runs)
"""

import json
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "frontend" / "games" / "s5-ascent-lite" / "levels.json"

# ── physics, mirrored from game.js ──────────────────────────────────────────
GRAVITY, JUMP_V, MAX_SPEED = 0.62, 11.6, 4.6
PW, PH = 26, 34

MAX_RISE = (JUMP_V ** 2) / (2 * GRAVITY)          # 108.5 px
AIRTIME = 2 * (JUMP_V / GRAVITY)                   # 37.4 frames
MAX_JUMP_DIST = AIRTIME * MAX_SPEED                # 172.1 px

# Budgets. A level is authored to the comfortable figure; the hard figure is
# the absolute ceiling and is only approached on the last stage.
SAFE_GAP = 0.62 * MAX_JUMP_DIST                    # ~107 px
HARD_GAP = 0.80 * MAX_JUMP_DIST                    # ~138 px
SAFE_RISE = 0.62 * MAX_RISE                        # ~67 px
HARD_RISE = 0.80 * MAX_RISE                        # ~87 px

GROUND_Y = 460
GROUND_H = 90

problems: list[str] = []


def P(x, y, w, h=18, type="solid", **kw):
    d = {"x": x, "y": y, "w": w, "h": h, "type": type}
    d.update(kw)
    return d


def ground(x, w, y=GROUND_Y):
    return P(x, y, w, GROUND_H)


# ═══════════════════════════════════════════════════════════════════════════
# STAGE 1 — First Light.  Idea: move and jump. No hazard, no failure state
# beyond falling in a clearly-signalled pit.
# ═══════════════════════════════════════════════════════════════════════════
def stage1():
    plat = [
        ground(0, 420),
        P(500, 400, 130), P(700, 340, 130), P(900, 400, 140),
        ground(1090, 300),
        P(1470, 390, 120), P(1660, 330, 120), P(1850, 390, 130),
        ground(2050, 340),
        P(2470, 380, 140), P(2680, 320, 150),
        ground(2900, 420),
    ]
    orbs = [
        {"x": 200, "y": 410}, {"x": 340, "y": 410},
        {"x": 565, "y": 355}, {"x": 765, "y": 295}, {"x": 970, "y": 355},
        {"x": 1200, "y": 410}, {"x": 1330, "y": 410},
        {"x": 1530, "y": 345}, {"x": 1720, "y": 285}, {"x": 1915, "y": 345},
        {"x": 2160, "y": 410}, {"x": 2300, "y": 410},
        {"x": 2540, "y": 335}, {"x": 2755, "y": 275},
        {"x": 3000, "y": 410}, {"x": 3140, "y": 410},
    ]
    return {
        "id": 1, "name": "First Light", "idea": "Move, jump, collect.",
        "hint": "Arrow keys or A / D to move · Space or W to jump",
        "width": 3400, "height": 540,
        "startX": 60, "startY": GROUND_Y - PH,
        "platforms": plat, "orbs": orbs,
        "prism": {"x": 2755, "y": 220},
        "spikes": [],
        "checkpoints": [{"x": 1200, "y": GROUND_Y}],
        "goal": {"x": 3260, "y": GROUND_Y - 34},
    }


# ═══════════════════════════════════════════════════════════════════════════
# STAGE 2 — The Cut.  Idea: spikes. Every hazard is on the ground, visible
# from a standing start, and always has a platform route over it.
# ═══════════════════════════════════════════════════════════════════════════
def stage2():
    plat = [
        ground(0, 340),
        P(430, 400, 120), P(620, 400, 120),
        ground(810, 260),
        P(1160, 390, 110), P(1340, 340, 110), P(1520, 390, 120),
        ground(1720, 300),
        P(2110, 400, 100), P(2280, 350, 100), P(2450, 400, 110),
        ground(2640, 280),
        P(3010, 390, 120), P(3200, 340, 130),
        ground(3420, 400),
    ]
    orbs = [
        {"x": 160, "y": 410}, {"x": 280, "y": 410},
        {"x": 490, "y": 355}, {"x": 680, "y": 355},
        {"x": 900, "y": 410}, {"x": 1020, "y": 410},
        {"x": 1215, "y": 345}, {"x": 1395, "y": 295}, {"x": 1580, "y": 345},
        {"x": 1810, "y": 410}, {"x": 1940, "y": 410},
        {"x": 2160, "y": 355}, {"x": 2330, "y": 305}, {"x": 2505, "y": 355},
        {"x": 2730, "y": 410}, {"x": 2860, "y": 410},
        {"x": 3070, "y": 345}, {"x": 3265, "y": 295},
        {"x": 3520, "y": 410}, {"x": 3680, "y": 410},
    ]
    # On the ground segments (0-340, 810-1070, 1720-2020, 2640-2920), clear of
    # the checkpoints at x=900 and x=2730.
    # Ground runs: 0-340, 810-1070, 1720-2020, 2640-2920, 3420-3820.
    # Each spike leaves >=150px of that run to land on.
    # Only two of the five ground runs are long enough to carry a hazard
    # safely: it must clear the landing zone of the incoming jump AND leave
    # room to land after itself. The 260px and 280px runs can do neither.
    spikes = [
        {"x": 130,  "y": GROUND_Y - 16, "w": 32},   # spawn run, no incoming jump
        {"x": 3620, "y": GROUND_Y - 16, "w": 32},   # 3420-3820 run, the only
                                                    # mid-level run wide enough
    ]
    return {
        "id": 2, "name": "The Cut", "idea": "Spikes. Look before you land.",
        "hint": "Red means it hurts. There is always a way over.",
        "width": 3900, "height": 540,
        "startX": 60, "startY": GROUND_Y - PH,
        "platforms": plat, "orbs": orbs,
        "prism": {"x": 3265, "y": 240},
        "spikes": spikes,
        "checkpoints": [{"x": 900, "y": GROUND_Y}, {"x": 2660, "y": GROUND_Y}],
        "goal": {"x": 3760, "y": GROUND_Y - 34},
    }


# ═══════════════════════════════════════════════════════════════════════════
# STAGE 3 — Driftworks.  Idea: moving platforms. Every mover has a static
# landing on both sides, so a mistimed jump costs a wait, not a life.
# ═══════════════════════════════════════════════════════════════════════════
def stage3():
    plat = [
        ground(0, 360),
        P(460, 400, 110),
        P(700, 380, 110, type="move", range=70, speed=1.1, axis="x"),
        P(950, 400, 180),          # widened: first landing off a mover
        ground(1160, 240),
        P(1500, 390, 110),
        # Horizontal, not vertical. A vertical mover gives you no control over
        # your take-off HEIGHT, which is the hardest variant in the game — and
        # this is the stage that introduces movers at all. The vertical kind
        # now appears first in stage 5, where its landing is 210px wide.
        P(1720, 360, 110, type="move", range=50, speed=1.5, axis="x"),
        P(1900, 390, 190),         # widened + pulled in: landing off the y-mover
        ground(2130, 280),        # pulled in: shortens the descent off P(1900)
        P(2500, 400, 100),
        P(2730, 380, 110, type="move", range=80, speed=1.3, axis="x"),
        P(2980, 400, 160),         # widened: landing off the second mover
        P(3210, 340, 110),
        ground(3370, 410),        # pulled in: shortens the final descent
    ]
    orbs = [
        {"x": 170, "y": 410}, {"x": 300, "y": 410},
        {"x": 515, "y": 355},
        {"x": 700, "y": 330}, {"x": 840, "y": 330},
        {"x": 1035, "y": 355},
        {"x": 1250, "y": 410}, {"x": 1360, "y": 410},
        {"x": 1555, "y": 345},
        {"x": 1775, "y": 330},
        {"x": 2045, "y": 345},
        {"x": 2260, "y": 410}, {"x": 2370, "y": 410},
        {"x": 2550, "y": 355},
        {"x": 2730, "y": 330}, {"x": 2880, "y": 330},
        {"x": 3070, "y": 355}, {"x": 3265, "y": 295},
        {"x": 3480, "y": 410}, {"x": 3620, "y": 410},
    ]
    return {
        "id": 3, "name": "Driftworks", "idea": "Moving platforms. Ride the rhythm.",
        "hint": "Teal platforms travel. Wait for the near end.",
        "width": 3880, "height": 540,
        "startX": 60, "startY": GROUND_Y - PH,
        "platforms": plat, "orbs": orbs,
        "prism": {"x": 1775, "y": 265},   # 95px above the mover at y=360
        # On the ground segments 1160-1400 and 2170-2410.
        # No spikes. This stage is about timing a moving platform; its ground
        # runs are 240px, too short to hold a hazard outside a landing zone,
        # and a hazard here would only dilute the one idea being taught.
        "spikes": [],
        "checkpoints": [{"x": 1300, "y": GROUND_Y}, {"x": 2310, "y": GROUND_Y}],
        "goal": {"x": 3720, "y": GROUND_Y - 34},
    }


# ═══════════════════════════════════════════════════════════════════════════
# STAGE 4 — Fallaway.  Idea: crumbling platforms — keep moving. Amber warns
# and the platform shakes for ~0.55 s before it goes, so the tell is fair.
# The old "deceptive" platform broke in 0.3 s with no warning at all.
# ═══════════════════════════════════════════════════════════════════════════
def stage4():
    plat = [
        ground(0, 340),
        P(430, 400, 100, type="crumble"),
        P(620, 380, 100, type="crumble"),
        P(810, 400, 110),
        ground(990, 220),
        P(1300, 390, 95, type="crumble"),
        P(1480, 350, 95, type="crumble"),
        P(1660, 390, 95, type="crumble"),
        P(1840, 400, 120),
        ground(2040, 240),
        P(2360, 400, 95, type="crumble"),
        P(2540, 360, 95, type="crumble"),
        P(2720, 330, 100),
        P(2900, 390, 95, type="crumble"),
        P(3080, 400, 110),
        ground(3270, 400),
    ]
    orbs = [
        {"x": 150, "y": 410}, {"x": 270, "y": 410},
        {"x": 480, "y": 355}, {"x": 670, "y": 335},
        {"x": 865, "y": 355},
        {"x": 1070, "y": 410}, {"x": 1170, "y": 410},
        {"x": 1347, "y": 345}, {"x": 1527, "y": 305}, {"x": 1707, "y": 345},
        {"x": 1900, "y": 355},
        {"x": 2110, "y": 410}, {"x": 2220, "y": 410},
        {"x": 2407, "y": 355}, {"x": 2587, "y": 315},
        {"x": 2770, "y": 285}, {"x": 2947, "y": 345},
        {"x": 3135, "y": 355},
        {"x": 3350, "y": 410}, {"x": 3500, "y": 410},
    ]
    return {
        "id": 4, "name": "Fallaway", "idea": "Crumbling ground. Do not stop.",
        "hint": "Amber platforms shake, then drop. Keep moving.",
        "width": 3720, "height": 540,
        "startX": 60, "startY": GROUND_Y - PH,
        "platforms": plat, "orbs": orbs,
        "prism": {"x": 2770, "y": 220},
        # On the ground segments 990-1210 and 2040-2280.
        # No spikes — the crumbling ground is the hazard.
        "spikes": [],
        "checkpoints": [{"x": 1120, "y": GROUND_Y}, {"x": 2160, "y": GROUND_Y}],
        "goal": {"x": 3580, "y": GROUND_Y - 34},
    }


# ═══════════════════════════════════════════════════════════════════════════
# STAGE 5 — The Rise.  Idea: climb. The camera follows vertically here, which
# no other stage exercises. One-way platforms let the player jump up through
# a ledge instead of being blocked by its underside.
# ═══════════════════════════════════════════════════════════════════════════
def stage5():
    """
    Redesigned. The first version was a back-and-forth tower: platforms
    alternating between x=500 and x=700 while climbing 500 px. In a
    side-scroller with a horizontal camera deadzone that reads as a wall, and
    it cannot be traversed left-to-right at all — the automated play test
    walked straight underneath it.

    It is now a rising staircase: the route still climbs the full height and
    still exercises the vertical camera, which nothing else does, but it
    advances rightward the whole way and then comes back down.
    """
    GY = 980
    plat = [
        ground(0, 420, y=GY),
        P(500, GY - 60,  130, type="oneway"),
        P(700, GY - 120, 130, type="oneway"),
        P(900, GY - 180, 130, type="oneway"),
        P(1100, GY - 240, 130, type="oneway"),
        P(1300, GY - 300, 150),
        P(1560, GY - 340, 120, type="move", range=70, speed=1.2, axis="x"),
        P(1790, GY - 360, 210),    # widened: landing off the mover
        P(2060, GY - 320, 130),
        P(2260, GY - 250, 130),
        P(2460, GY - 160, 140),
        ground(2680, 440, y=GY),
    ]
    orbs = [
        {"x": 170, "y": GY - 50}, {"x": 300, "y": GY - 50},
        {"x": 560, "y": GY - 110}, {"x": 760, "y": GY - 170},
        {"x": 960, "y": GY - 230}, {"x": 1160, "y": GY - 290},
        {"x": 1370, "y": GY - 350},
        {"x": 1560, "y": GY - 390}, {"x": 1690, "y": GY - 390},
        {"x": 1900, "y": GY - 410},
        {"x": 2120, "y": GY - 370}, {"x": 2320, "y": GY - 300},
        {"x": 2525, "y": GY - 210},
        {"x": 2760, "y": GY - 50}, {"x": 2900, "y": GY - 50},
    ]
    return {
        "id": 5, "name": "The Rise", "idea": "Climb. The view moves with you.",
        "hint": "Pale ledges can be jumped through from underneath.",
        "width": 3200, "height": 1080,
        "startX": 60, "startY": GY - PH,
        "platforms": plat, "orbs": orbs,
        "prism": {"x": 1900, "y": GY - 455},   # 95px above the ledge at GY-360, inside the 108px arc
        "spikes": [],
        "checkpoints": [{"x": 1370, "y": GY - 300}, {"x": 2320, "y": GY - 250}],
        "goal": {"x": 3040, "y": GY - 34},
    }


# ═══════════════════════════════════════════════════════════════════════════
# STAGE 6 — Convergence.  Idea: everything at once, at the widest spacing the
# jump arc allows. This is the only stage authored against HARD_GAP.
# ═══════════════════════════════════════════════════════════════════════════
def stage6():
    plat = [
        ground(0, 300),
        P(400, 400, 100, type="crumble"),
        P(590, 370, 100),
        P(790, 390, 100, type="move", range=70, speed=1.4, axis="x"),
        P(990, 400, 210),          # widened + pulled right in: a 50px gap off a
                                   # mover was still the tightest jump in the game
        ground(1250, 220),
        P(1560, 390, 95, type="crumble"),
        P(1740, 350, 95, type="crumble"),
        P(1920, 320, 110),
        P(2110, 370, 100, type="move", range=60, speed=1.6, axis="y"),
        P(2270, 390, 190),         # widened + pulled in: landing off the y-mover
        ground(2530, 220),
        P(2840, 390, 95, type="crumble"),
        P(3020, 350, 95),
        P(3200, 320, 100, type="move", range=80, speed=1.5, axis="x"),
        P(3440, 360, 180),         # widened: landing off the x-mover
        P(3690, 400, 110),
        ground(3880, 420),
    ]
    orbs = [
        {"x": 140, "y": 410}, {"x": 250, "y": 410},
        {"x": 450, "y": 355}, {"x": 640, "y": 325},
        {"x": 790, "y": 345}, {"x": 930, "y": 345},
        {"x": 1125, "y": 355},
        {"x": 1330, "y": 410}, {"x": 1430, "y": 410},
        {"x": 1607, "y": 345}, {"x": 1787, "y": 305},
        {"x": 1975, "y": 275},
        {"x": 2160, "y": 320},
        {"x": 2405, "y": 345},
        {"x": 2610, "y": 410}, {"x": 2710, "y": 410},
        {"x": 2887, "y": 345}, {"x": 3067, "y": 305},
        {"x": 3200, "y": 275}, {"x": 3340, "y": 275},
        {"x": 3555, "y": 315}, {"x": 3745, "y": 355},
        {"x": 3960, "y": 410}, {"x": 4120, "y": 410},
    ]
    return {
        "id": 6, "name": "Convergence", "idea": "Everything at once.",
        "hint": "You have seen all of this. Now it arrives together.",
        "width": 4400, "height": 540,
        "startX": 60, "startY": GROUND_Y - PH,
        "platforms": plat, "orbs": orbs,
        "prism": {"x": 1975, "y": 230},   # 90px above the ledge at y=320 — a real reach, inside the arc
        # On the ground segments 0-300, 1250-1470, 2530-2750, 3880-4300.
        # Ground runs 0-300, 1250-1470, 2530-2750, 3880-4300.
        "spikes": [
            {"x": 110,  "y": GROUND_Y - 16, "w": 32},   # spawn run
            {"x": 4080, "y": GROUND_Y - 16, "w": 32},   # 3880-4300 run
        ],
        "checkpoints": [{"x": 1360, "y": GROUND_Y},
                        {"x": 2640, "y": GROUND_Y}],
        "goal": {"x": 4260, "y": GROUND_Y - 34},
    }


# ═══════════════════════════════════════════════════════════════════════════
# VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════
T_APEX = JUMP_V / GRAVITY          # 18.7 frames


def jump_height_at(t):
    """Height of the jump arc t frames after take-off."""
    return JUMP_V * t - 0.5 * GRAVITY * t * t


def best_height_over(gap, speed=MAX_SPEED):
    """
    The highest the player can be when they have travelled `gap` horizontally.

    The player picks their approach speed, so the crossing time is anything
    from gap/MAX_SPEED upwards — running slower buys airtime. The arc peaks at
    T_APEX, so the best available crossing time is whichever of (fastest
    possible, apex) comes later.

    This replaces an earlier heuristic that simply added the gap and rise as
    fractions of their maxima. That treated a 90 px gap with a 70 px rise as
    impossible when in fact the player arrives at t=19.6 — one frame past the
    apex, with 108 px of height in hand.
    """
    t_min = gap / speed
    return jump_height_at(max(t_min, T_APEX))


def surfaces(lv):
    """Landing surfaces as (left, right, top), left to right."""
    return sorted([(p["x"], p["x"] + p["w"], p["y"]) for p in lv["platforms"]],
                  key=lambda t: t[0])


def reach_spans(lv):
    """
    Platforms expressed as what the player can actually use.

    A mover is not one position, it is a range the player can wait for:
      * travelling in x  -> its span widens by `range` on both sides
      * travelling in y  -> as a launch pad, take its highest point;
                            as a landing, take its lowest.
    Both are the favourable case, which is the case a player who waits gets.
    """
    out = []
    for p in lv["platforms"]:
        l, r = p["x"], p["x"] + p["w"]
        top_src = top_dst = p["y"]
        if p.get("type") == "move":
            rg = p.get("range", 0)
            if p.get("axis", "x") == "x":
                l -= rg
                r += rg
            else:
                top_src = p["y"] - rg
                top_dst = p["y"] + rg
        out.append({"l": l, "r": r, "src": top_src, "dst": top_dst,
                    "type": p.get("type", "solid"), "raw": p})
    return sorted(out, key=lambda z: z["l"])


def verify(lv):
    name = f"Stage {lv['id']} ({lv['name']})"
    hard = lv["id"] == 6
    clearance = 8 if hard else 16      # px of headroom demanded over the arc

    surf = surfaces(lv)
    reach = reach_spans(lv)

    # ── spawn must be on a surface ──────────────────────────────────────────
    sx, sy = lv["startX"], lv["startY"]
    if not any(l - 4 <= sx <= r and abs((sy + PH) - t) < 3 for l, r, t in surf):
        problems.append(f"{name}: player does not spawn on a surface")

    # ── consecutive reachability, against the real arc ──────────────────────
    for i in range(len(reach) - 1):
        a, b = reach[i], reach[i + 1]
        gap = b["l"] - a["r"]
        if gap <= 0:
            continue                                   # adjacent or overlapping
        rise = a["src"] - b["dst"]                      # positive = stepping up
        if gap > MAX_JUMP_DIST - 10:
            problems.append(
                f"{name}: gap of {gap:.0f}px at x={a['r']:.0f} exceeds the "
                f"{MAX_JUMP_DIST:.0f}px maximum jump distance")
            continue
        h = best_height_over(gap)
        if h < rise + clearance:
            problems.append(
                f"{name}: {gap:.0f}px gap with a {rise:.0f}px rise at x={b['l']:.0f} "
                f"— the arc only reaches {h:.0f}px there, needs {rise + clearance:.0f}px")

    # ── the platform after a mover must be generous ────────────────────────
    # You leave a moving platform from wherever it happens to be, so your
    # take-off point and speed are not yours to choose. Every stage that failed
    # automated play testing failed on the jump immediately after a mover.
    # That landing therefore has to be wide enough to absorb an imprecise
    # arrival, and the gap onto it short enough to reach from the mover's far
    # end. (A descending gap elsewhere is fine — stages 1, 2 and 4 are full of
    # them and play cleanly.)
    for i in range(len(reach) - 1):
        a, b = reach[i], reach[i + 1]
        if a["type"] != "move":
            continue
        gap = b["l"] - a["r"]
        if gap > 75:
            problems.append(
                f"{name}: {gap:.0f}px gap off the mover at x={a['l']:.0f} — "
                f"75px is the limit when the take-off point is not the player's to pick")
        width = b["r"] - b["l"]
        if width < 150:
            problems.append(
                f"{name}: the landing after the mover at x={a['l']:.0f} is only "
                f"{width:.0f}px wide — needs 150px to absorb an imprecise arrival")

    # ── overlaps ────────────────────────────────────────────────────────────
    ps = lv["platforms"]
    for i in range(len(ps)):
        for j in range(i + 1, len(ps)):
            a, b = ps[i], ps[j]
            if (a["x"] < b["x"] + b["w"] and a["x"] + a["w"] > b["x"] and
                    a["y"] < b["y"] + b["h"] and a["y"] + a["h"] > b["y"]):
                problems.append(f"{name}: platforms overlap at x={a['x']} and x={b['x']}")

    # ── collectibles must be within a jump of some surface ─────────────────
    for o in lv["orbs"] + ([lv["prism"]] if lv.get("prism") else []):
        if not any(z["l"] - 45 <= o["x"] <= z["r"] + 45 and
                   -30 <= (z["src"] - o["y"]) <= MAX_RISE + 5
                   for z in reach):
            problems.append(
                f"{name}: collectible at ({o['x']},{o['y']}) is not within reach of any surface")

    # ── goal + checkpoints must sit on a surface ────────────────────────────
    g = lv["goal"]
    if not any(l - 30 <= g["x"] <= r + 30 and abs(t - (g["y"] + 34)) < 40 for l, r, t in surf):
        problems.append(f"{name}: goal at x={g['x']} is not on a surface")
    for c in lv["checkpoints"]:
        if not any(l - 20 <= c["x"] <= r + 20 and abs(t - c["y"]) < 30 for l, r, t in surf):
            problems.append(f"{name}: checkpoint at x={c['x']} is not on a surface")

    # ── every hazard must stand on something ───────────────────────────────
    # The first pass of these levels put spikes at GROUND_Y-16 without checking
    # that ground actually existed at that x. Four of them ended up hovering in
    # mid-air over the pits, directly inside the arc the player has to fly
    # through to cross. Unwinnable, and invisible in the JSON.
    for s in lv["spikes"]:
        supported = any(l <= s["x"] and s["x"] + s["w"] <= r and
                        abs(t - (s["y"] + s.get("h", 16))) < 3
                        for l, r, t in surf)
        if not supported:
            problems.append(
                f"{name}: spike at x={s['x']}-{s['x'] + s['w']} is not resting on any "
                f"platform — it floats in the player's path")

    # ── a hazard must not sit in a landing zone ────────────────────────────
    # A jump across a pit lands roughly 60-200px into the next platform. A
    # spike inside that band kills a player who did nothing wrong — they made
    # the jump and the game killed them for it. Hazards therefore start at
    # least 190px into a platform, except on the platform the player spawns on,
    # which has no incoming jump.
    for s in lv["spikes"]:
        for l, r, t in surf:
            if l <= s["x"] and s["x"] + s["w"] <= r and abs(t - (s["y"] + s.get("h", 16))) < 3:
                spawn_here = l - 4 <= lv["startX"] <= r
                if not spawn_here and s["x"] - l < 190:
                    problems.append(
                        f"{name}: spike at x={s['x']} is only {s['x'] - l:.0f}px into the "
                        f"platform — inside the zone an incoming jump lands in")

    # ── a hazard needs runway after it ─────────────────────────────────────
    # A 64px spike forces a long jump, and a long jump from 36px out travels
    # ~170px. Where the platform ended 46px past the spike, clearing the hazard
    # threw the player straight off the far edge into the pit. Hazards are now
    # 32px and must leave at least 150px of platform to land on.
    for s in lv["spikes"]:
        if s["w"] > 40:
            problems.append(f"{name}: spike at x={s['x']} is {s['w']}px wide — "
                            f"wide hazards force a jump that overshoots the platform")
        for l, r, t in surf:
            if l <= s["x"] and s["x"] + s["w"] <= r and abs(t - (s["y"] + s.get("h", 16))) < 3:
                runway = r - (s["x"] + s["w"])
                if runway < 150:
                    problems.append(
                        f"{name}: spike at x={s['x']} leaves only {runway:.0f}px of platform "
                        f"after it — a jump clearing it lands past the edge")

    # ── a hazard must never fully cover a short platform ───────────────────
    for s in lv["spikes"]:
        for l, r, t in surf:
            if s["x"] >= l and s["x"] + s["w"] <= r and abs(t - (s["y"] + 16)) < 4:
                if r - l < 200:
                    problems.append(
                        f"{name}: spike at x={s['x']} covers a short platform with no footing")

    # ── bounds ─────────────────────────────────────────────────────────────
    for p in lv["platforms"]:
        if p["x"] < -10 or p["x"] + p["w"] > lv["width"] + 10:
            problems.append(f"{name}: platform at x={p['x']} is outside the level width")
    if g["x"] > lv["width"]:
        problems.append(f"{name}: goal is outside the level width")


def main() -> int:
    check_only = "--check" in sys.argv
    lvs = [stage1(), stage2(), stage3(), stage4(), stage5(), stage6()]

    print("S.5 ASCENT — level build")
    print(f"  jump arc: rise {MAX_RISE:.0f}px · distance {MAX_JUMP_DIST:.0f}px · airtime {AIRTIME:.0f} frames")
    print(f"  reach   : {best_height_over(100):.0f}px of height still available after a 100px gap")
    print()

    for lv in lvs:
        verify(lv)
        n_orbs = len(lv["orbs"]) + (1 if lv.get("prism") else 0)
        print(f"  Stage {lv['id']}  {lv['name']:<13} {lv['width']:>5}x{lv['height']:<5} "
              f"{len(lv['platforms']):>2} platforms · {n_orbs:>2} collectibles · "
              f"{len(lv['spikes'])} hazards · {len(lv['checkpoints'])} checkpoints")

    print()
    if problems:
        print(f"{len(problems)} PROBLEM(S) — nothing written:")
        for p in problems:
            print(f"  FAIL  {p}")
        return 1

    print("All reachability checks passed.")
    if check_only:
        print("(--check: no file written)")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"levels": lvs}, indent=1) + "\n")
    print(f"Wrote {OUT.relative_to(REPO)} ({OUT.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
