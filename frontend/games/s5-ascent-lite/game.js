/* ═══════════════════════════════════════════════════════════════════════════
   S.5 ASCENT — a public Sentinel Fortune mini-game
   Vanilla JS · canvas 2D · no dependencies · no backend · no account

   Rewritten from the original vertical tower climber. What changed and why:

   1. FIXED VIRTUAL RESOLUTION. The old build scaled the world by
      canvas.width / 360, so a 1280px desktop showed about two platform rows
      while a 390px phone showed six. Same level, two different games, and the
      desktop one was unplayable. Everything now renders into a fixed
      960x540 virtual viewport that is letterboxed to fit, so every player sees
      the same thing.

   2. SIDE-SCROLLING. The tower was a vertical zig-zag whose five levels were
      the same shape with different platform types. Levels are now horizontal
      courses, each built around one distinct idea.

   3. CHECKPOINTS AND LIVES. One mistake used to throw away a 3,600-unit climb.
      Death now returns you to the last beacon.

   4. NO GATE. Finishing the game finishes the game. There is no paywall
      screen and nothing to unlock.

   Original work only: no third-party sprites, audio, level layouts or
   characters. All art is drawn procedurally from the Sentinel Fortune palette.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── VIRTUAL VIEWPORT ──────────────────────────────────────────────────
     The world is authored in these units and never in device pixels. */
  var VW = 960, VH = 540;

  /* ── PHYSICS ───────────────────────────────────────────────────────────
     Tuned together — changing one without the others breaks every level's
     reachability. scripts/build_s5_levels.py holds the same numbers and
     refuses to emit a level whose gaps exceed what they permit. */
  var GRAVITY      = 0.62;
  var JUMP_V       = -11.6;   // max rise 108 px
  var JUMP_CUT_KEEP = 0.55;   // velocity kept when the jump is released early:
                              // a tap gives 0.55^2 = 30% of full height
  var ACCEL        = 0.70;
  var AIR_ACCEL    = 0.42;    // less authority mid-air, so commitment matters
  var FRICTION     = 0.80;
  var MAX_SPEED    = 4.6;
  var MAX_FALL     = 13.5;
  var COYOTE       = 7;       // frames of grace after walking off an edge
  var JUMP_BUFFER  = 7;       // frames a jump press is remembered before landing

  var PW = 26, PH = 34;       // player box

  /* ── PALETTE ───────────────────────────────────────────────────────────
     Brighter than the original, which was near-black on near-black. Navy
     foundation, gold identity, with teal/amber/violet carrying meaning:
     teal = safe and moving, amber = will not hold, violet = reward. */
  var C = {
    skyTop:    '#1b3a6b',
    skyMid:    '#2a5c9a',
    skyLow:    '#4a86c8',
    skyGlow:   '#7fb4e0',
    far:       '#22406e',
    mid:       '#1a3157',
    near:      '#132845',

    solid:     '#2d5a94',
    solidTop:  '#5fa8e0',
    solidEdge: '#8fd0ff',

    move:      '#1d6b72',
    moveTop:   '#3fd0c8',

    crumble:   '#7a4a1c',
    crumbleTop:'#f0a848',

    spike:     '#e05a48',
    spikeHi:   '#ff9078',

    gold:      '#f5c542',
    goldHi:    '#fff0a8',
    prism:     '#b56ff0',
    prismHi:   '#e0b0ff',

    beacon:    '#3fd0c8',
    goal:      '#f5d980',

    player:    '#f2f5fa',
    playerLo:  '#9fc4e8',
    playerAcc: '#f5c542',

    ink:       '#0a1navy'
  };

  /* ── STATE ─────────────────────────────────────────────────────────────── */
  var canvas, ctx, dpr = 1;
  var view = { x: 0, y: 0, w: VW, h: VH, scale: 1 };  // letterbox transform
  var state = 'loading';   // loading|menu|playing|dead|levelComplete|gameComplete
  var levels = null;
  var idx = 0;
  var L = null;            // active level

  var player = { x:0, y:0, vx:0, vy:0, onGround:false, coyote:0, buffer:0,
                 facing:1, anim:0, squash:0, dead:false, spawnX:0, spawnY:0 };

  var cam = { x:0, y:0 };
  var lives = 3;
  var orbs = 0, orbsTotal = 0;
  var score = 0, runScore = 0;
  var levelTime = 0;
  var particles = [], pops = [], shake = 0, flash = 0;
  var reducedMotion = false;

  var keys = {}, touch = { l:false, r:false, j:false }, prevJump = false;

  /* ═══════════════════════════════════════════════════════════════════════
     PERSISTENCE — localStorage only. No account, no server, no cookie.
     Every access is guarded: some privacy modes throw on access, and a saved
     high score is never worth an exception that kills the game loop.
     ═══════════════════════════════════════════════════════════════════════ */
  var SAVE_KEY = 's5-ascent-progress-v2';

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { unlocked: 1, best: {}, totalScore: 0 };
      var d = JSON.parse(raw);
      return {
        unlocked: Math.max(1, d.unlocked | 0),
        best: d.best && typeof d.best === 'object' ? d.best : {},
        totalScore: d.totalScore | 0
      };
    } catch (e) { return { unlocked: 1, best: {}, totalScore: 0 }; }
  }

  function writeSave(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  var save = loadSave();

  /* ═══════════════════════════════════════════════════════════════════════
     SOUND — synthesised on the fly. There is no audio file in this repository
     and none is invented: every sound here is generated by the Web Audio API
     at the moment it plays. Muted state persists. The context is created on
     the first real gesture, which is what browsers require for autoplay.
     ═══════════════════════════════════════════════════════════════════════ */
  var actx = null, muted = false;
  try { muted = localStorage.getItem('s5-muted') === '1'; } catch (e) {}

  function audioReady() {
    if (muted) return false;
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return false; }
    }
    if (actx.state === 'suspended') actx.resume().catch(function () {});
    return true;
  }

  function beep(freq, dur, type, vol, slideTo) {
    if (!audioReady()) return;
    try {
      var t = actx.currentTime;
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }

  var SFX = {
    jump:     function () { beep(320, 0.12, 'square',   0.05, 560); },
    land:     function () { beep(150, 0.06, 'sine',     0.04); },
    orb:      function () { beep(880, 0.09, 'triangle', 0.05, 1320); },
    prism:    function () { beep(660, 0.28, 'triangle', 0.07, 1760); },
    check:    function () { beep(520, 0.18, 'sine',     0.06, 780); },
    die:      function () { beep(300, 0.36, 'sawtooth', 0.06, 70); },
    goal:     function () { beep(523, 0.16, 'triangle', 0.07);
                            setTimeout(function () { beep(659, 0.16, 'triangle', 0.07); }, 130);
                            setTimeout(function () { beep(784, 0.30, 'triangle', 0.08); }, 260); },
    crumble:  function () { beep(200, 0.10, 'sawtooth', 0.04, 110); }
  };

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('s5-muted', m ? '1' : '0'); } catch (e) {}
    var b = document.getElementById('btn-mute');
    if (b) {
      b.textContent = m ? '🔇' : '🔊';
      b.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
      b.setAttribute('aria-pressed', String(m));
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     CANVAS + LETTERBOX
     ═══════════════════════════════════════════════════════════════════════ */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);   // capped: 3x costs more than it shows
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    canvas.width = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    var s = Math.min(cw / VW, ch / VH);
    view.scale = s;
    view.x = (cw - VW * s) / 2;
    view.y = (ch - VH * s) / 2;
  }

  function applyView() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath();
    ctx.rect(0, 0, VW, VH);
    ctx.clip();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     LEVEL LOADING
     ═══════════════════════════════════════════════════════════════════════ */
  function loadLevels() {
    fetch('levels.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        levels = d.levels;
        state = 'menu';
        buildLevelSelect();
        show('screen-menu');
      })
      .catch(function (err) {
        /* Say what happened rather than sitting on a blank canvas forever. */
        console.warn('[s5] levels failed to load', err);
        state = 'error';
        var m = document.getElementById('load-error');
        if (m) m.hidden = false;
        show('screen-menu');
      });
  }

  function startLevel(i) {
    idx = i;
    L = levels[i];
    lives = 3;
    orbs = 0;
    runScore = 0;
    levelTime = 0;
    particles = []; pops = [];

    L._plat = L.platforms.map(function (p) {
      return { x:p.x, y:p.y, w:p.w, h:p.h, type:p.type || 'solid',
               range:p.range || 0, speed:p.speed || 1, axis:p.axis || 'x',
               off:0, dir:1, timer:0, gone:false, ox:p.x, oy:p.y };
    });
    L._orbs = (L.orbs || []).map(function (o) { return { x:o.x, y:o.y, got:false, t:Math.random()*6.28 }; });
    L._prism = L.prism ? { x:L.prism.x, y:L.prism.y, got:false, t:0 } : null;
    L._spikes = (L.spikes || []).map(function (s) { return { x:s.x, y:s.y, w:s.w, h:s.h || 16, dir:s.dir || 'up' }; });
    L._checks = (L.checkpoints || []).map(function (c) { return { x:c.x, y:c.y, hit:false }; });
    orbsTotal = L._orbs.length + (L._prism ? 1 : 0);

    player.spawnX = L.startX; player.spawnY = L.startY;
    respawn(true);

    state = 'playing';
    hideAll();
    showEl('hud'); showEl('touch-controls');
    updateHUD();
  }

  function respawn(full) {
    player.x = player.spawnX; player.y = player.spawnY;
    player.vx = 0; player.vy = 0;
    player.onGround = false; player.coyote = 0; player.buffer = 0;
    player.dead = false; player.squash = 0;
    cam.x = clamp(player.x - VW / 2, 0, Math.max(0, L.width - VW));
    cam.y = clamp(player.y - VH / 2, 0, Math.max(0, L.height - VH));
    if (full) {
      L._plat.forEach(function (p) { p.gone = false; p.timer = 0; p.off = 0; p.dir = 1; });
    } else {
      /* A respawn restores crumbled platforms — otherwise a checkpoint can
         become unreachable and the level is soft-locked. */
      L._plat.forEach(function (p) { if (p.type === 'crumble') { p.gone = false; p.timer = 0; } });
    }
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ═══════════════════════════════════════════════════════════════════════
     UPDATE
     ═══════════════════════════════════════════════════════════════════════ */
  function update() {
    if (state !== 'playing') return;
    levelTime++;

    var left  = keys['ArrowLeft']  || keys['a'] || keys['A'] || touch.l;
    var right = keys['ArrowRight'] || keys['d'] || keys['D'] || touch.r;
    var jump  = keys['ArrowUp'] || keys[' '] || keys['w'] || keys['W'] ||
                keys['Spacebar'] || touch.j;

    /* Jump buffer: pressing just before landing still jumps on touchdown,
       which is the difference between "responsive" and "it ignored me". */
    if (jump && !prevJump) player.buffer = JUMP_BUFFER;
    else if (player.buffer > 0) player.buffer--;

    var a = player.onGround ? ACCEL : AIR_ACCEL;
    if (left && !right)      { player.vx -= a; player.facing = -1; }
    else if (right && !left) { player.vx += a; player.facing = 1; }
    else if (player.onGround) player.vx *= FRICTION;
    else player.vx *= 0.985;
    player.vx = clamp(player.vx, -MAX_SPEED, MAX_SPEED);
    if (Math.abs(player.vx) < 0.05) player.vx = 0;

    if (player.onGround) player.coyote = COYOTE;
    else if (player.coyote > 0) player.coyote--;

    if (player.buffer > 0 && player.coyote > 0) {
      player.vy = JUMP_V;
      player.onGround = false;
      player.coyote = 0; player.buffer = 0;
      player.squash = -1;
      burst(player.x + PW / 2, player.y + PH, 5, C.solidEdge, 1.4);
      SFX.jump();
    }
    /* Variable height, applied ONCE on release rather than every airborne
       frame. Compounding it per frame meant a short tap kept only 36% of the
       take-off velocity — and since height goes with v², 12% of the arc. A tap
       should be a small hop, not a failure to jump. */
    if (!jump && prevJump && player.vy < 0) player.vy *= JUMP_CUT_KEEP;
    prevJump = jump;

    player.vy = Math.min(player.vy + GRAVITY, MAX_FALL);

    movePlatforms();

    var wasAir = !player.onGround;
    moveAndCollide();
    if (wasAir && player.onGround) {
      player.squash = 1;
      burst(player.x + PW / 2, player.y + PH, 4, C.solidEdge, 1.1);
      SFX.land();
    }
    if (player.squash !== 0) player.squash *= 0.82;
    if (Math.abs(player.squash) < 0.02) player.squash = 0;

    player.anim += Math.abs(player.vx) * 0.16;

    hazards();
    pickups();
    checkpoints();
    goal();

    /* Fell out of the world. */
    if (player.y > L.height + 120) die();

    camera();

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (var j = pops.length - 1; j >= 0; j--) {
      pops[j].y -= 0.9; pops[j].life--;
      if (pops[j].life <= 0) pops.splice(j, 1);
    }
    if (shake > 0) shake *= 0.86;
    if (flash > 0) flash -= 0.05;
  }

  function movePlatforms() {
    for (var i = 0; i < L._plat.length; i++) {
      var p = L._plat[i];
      if (p.type === 'move') {
        p.off += p.dir * p.speed;
        if (p.off > p.range) { p.off = p.range; p.dir = -1; }
        if (p.off < -p.range) { p.off = -p.range; p.dir = 1; }
        if (p.axis === 'y') { p.y = p.oy + p.off; } else { p.x = p.ox + p.off; }
      }
      if (p.type === 'crumble' && p.timer > 0 && !p.gone) {
        p.timer++;
        if (p.timer > 34) { p.gone = true; p.respawn = 150; SFX.crumble();
          burst(p.x + p.w / 2, p.y, 9, C.crumbleTop, 2); }
      }
      /* Crumbled platforms come back after a moment. Without this a retry
         after two deaths could find the route physically missing. */
      if (p.gone && p.respawn !== undefined) {
        p.respawn--;
        if (p.respawn <= 0) { p.gone = false; p.timer = 0; }
      }
    }
  }

  /* Axis-separated movement. Doing X and Y in one pass is what produces the
     classic "snag on a seam between two flush platforms" bug. */
  function moveAndCollide() {
    player.x += player.vx;
    var i, p;
    for (i = 0; i < L._plat.length; i++) {
      p = L._plat[i];
      if (p.gone || p.type === 'oneway') continue;
      if (!aabb(player.x, player.y, PW, PH, p.x, p.y, p.w, p.h)) continue;
      if (player.vx > 0) player.x = p.x - PW;
      else if (player.vx < 0) player.x = p.x + p.w;
      player.vx = 0;
    }
    player.x = clamp(player.x, 0, L.width - PW);

    player.y += player.vy;
    player.onGround = false;
    for (i = 0; i < L._plat.length; i++) {
      p = L._plat[i];
      if (p.gone) continue;

      if (p.type === 'oneway') {
        /* Passable from below and from the sides; solid only when descending
           onto the top edge. */
        if (player.vy < 0) continue;
        var prevBottom = player.y + PH - player.vy;
        if (prevBottom > p.y + 1) continue;
      }
      if (!aabb(player.x, player.y, PW, PH, p.x, p.y, p.w, p.h)) continue;

      if (player.vy > 0) {
        player.y = p.y - PH;
        player.onGround = true;
        if (p.type === 'move' && p.axis === 'x') player.x += p.dir * p.speed;
        if (p.type === 'move' && p.axis === 'y') player.y = p.y - PH;
        if (p.type === 'crumble' && p.timer === 0) p.timer = 1;
      } else if (player.vy < 0) {
        player.y = p.y + p.h;
      }
      player.vy = 0;
    }
  }

  function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function hazards() {
    for (var i = 0; i < L._spikes.length; i++) {
      var s = L._spikes[i];
      /* Inset the lethal box: the drawn triangles do not fill their footprint,
         so a full-rect test kills the player for a near-miss. */
      if (aabb(player.x + 4, player.y + 4, PW - 8, PH - 6, s.x + 2, s.y + 4, s.w - 4, s.h - 6)) {
        die(); return;
      }
    }
  }

  function pickups() {
    var i, o;
    for (i = 0; i < L._orbs.length; i++) {
      o = L._orbs[i];
      if (o.got) continue;
      o.t += 0.09;
      if (Math.abs(player.x + PW / 2 - o.x) < 22 && Math.abs(player.y + PH / 2 - o.y) < 24) {
        o.got = true; orbs++; runScore += 100;
        burst(o.x, o.y, 10, C.goldHi, 2.4);
        pops.push({ x:o.x, y:o.y, text:'+100', life:44, color:C.goldHi });
        SFX.orb(); updateHUD();
      }
    }
    if (L._prism && !L._prism.got) {
      L._prism.t += 0.05;
      if (Math.abs(player.x + PW / 2 - L._prism.x) < 26 && Math.abs(player.y + PH / 2 - L._prism.y) < 28) {
        L._prism.got = true; orbs++; runScore += 500;
        burst(L._prism.x, L._prism.y, 22, C.prismHi, 3.4);
        pops.push({ x:L._prism.x, y:L._prism.y, text:'+500 PRISM', life:70, color:C.prismHi });
        flash = 0.45; SFX.prism(); updateHUD();
      }
    }
  }

  function checkpoints() {
    for (var i = 0; i < L._checks.length; i++) {
      var c = L._checks[i];
      if (c.hit) continue;
      if (Math.abs(player.x + PW / 2 - c.x) < 30 && Math.abs(player.y + PH / 2 - c.y) < 46) {
        c.hit = true;
        player.spawnX = c.x - PW / 2;
        player.spawnY = c.y - PH;
        burst(c.x, c.y, 14, C.beacon, 2.6);
        pops.push({ x:c.x, y:c.y - 20, text:'CHECKPOINT', life:70, color:C.beacon });
        SFX.check();
      }
    }
  }

  function goal() {
    if (!L.goal) return;
    if (Math.abs(player.x + PW / 2 - L.goal.x) < 34 && Math.abs(player.y + PH / 2 - L.goal.y) < 54) {
      finishLevel();
    }
  }

  function die() {
    if (state !== 'playing' || player.dead) return;
    player.dead = true;
    lives--;
    shake = 10; if (reducedMotion) shake = 0;
    burst(player.x + PW / 2, player.y + PH / 2, 20, C.spikeHi, 3.2);
    SFX.die();
    updateHUD();

    setTimeout(function () {
      if (lives > 0) { respawn(false); }
      else { state = 'dead'; hideEl('hud'); hideEl('touch-controls'); show('screen-gameover'); }
    }, 620);
  }

  function finishLevel() {
    if (state !== 'playing') return;
    state = 'levelComplete';
    SFX.goal();
    burst(L.goal.x, L.goal.y, 30, C.goal, 4);

    var timeBonus = Math.max(0, 3000 - levelTime * 2);
    var allOrbs = (orbs === orbsTotal);
    var perfect = allOrbs ? 1000 : 0;
    var total = runScore + timeBonus + perfect;
    score += total;

    var key = 'L' + L.id;
    if (!save.best[key] || total > save.best[key]) save.best[key] = total;
    save.unlocked = Math.max(save.unlocked, Math.min(levels.length, idx + 2));
    save.totalScore = Math.max(save.totalScore, score);
    writeSave(save);

    setTimeout(function () {
      hideEl('hud'); hideEl('touch-controls');
      var last = idx >= levels.length - 1;
      setText('lc-name', L.name);
      setText('lc-idea', L.idea);
      setText('lc-orbs', orbs + ' / ' + orbsTotal);
      setText('lc-time', (levelTime / 60).toFixed(1) + 's');
      setText('lc-bonus', timeBonus + (perfect ? '  +1000 perfect' : ''));
      setText('lc-total', String(total));
      var nb = document.getElementById('btn-next');
      if (nb) nb.textContent = last ? 'See your run' : 'Next stage →';
      show(last ? 'screen-complete' : 'screen-level-complete');
      if (last) {
        setText('gc-score', String(score));
        setText('gc-levels', String(levels.length));
      }
    }, 900);
  }

  function burst(x, y, n, color, spd) {
    if (reducedMotion) n = Math.min(n, 3);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = Math.random() * spd + 0.4;
      particles.push({ x:x, y:y, vx:Math.cos(a)*s, vy:Math.sin(a)*s - 0.8,
                       life:26 + Math.random()*18, max:44, color:color, r:1.4 + Math.random()*2 });
    }
  }

  function camera() {
    /* Horizontal deadzone: the camera only moves once the player leaves the
       middle third, so small adjustments do not swim the whole screen. */
    var tx = player.x + PW / 2 - VW / 2;
    var dz = 70;
    if (player.x + PW / 2 < cam.x + VW / 2 - dz) tx = player.x + PW / 2 - (VW / 2 - dz);
    else if (player.x + PW / 2 > cam.x + VW / 2 + dz) tx = player.x + PW / 2 - (VW / 2 + dz);
    else tx = cam.x;
    cam.x += (clamp(tx, 0, Math.max(0, L.width - VW)) - cam.x) * 0.14;
    cam.x = clamp(cam.x, 0, Math.max(0, L.width - VW));

    var ty = clamp(player.y + PH / 2 - VH * 0.58, 0, Math.max(0, L.height - VH));
    cam.y += (ty - cam.y) * 0.10;
    cam.y = clamp(cam.y, 0, Math.max(0, L.height - VH));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */
  function render() {
    applyView();

    var sx = 0, sy = 0;
    if (shake > 0.4) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }

    sky();
    if (state === 'playing' || state === 'levelComplete' || state === 'dead') {
      ctx.save();
      ctx.translate(-Math.round(cam.x) + sx, -Math.round(cam.y) + sy);
      parallax();
      drawPlatforms();
      drawSpikes();
      drawCheckpoints();
      drawGoal();
      drawOrbs();
      drawParticles();
      if (!player.dead) drawPlayer();
      drawPops();
      ctx.restore();
      if (flash > 0) {
        ctx.fillStyle = 'rgba(224,176,255,' + (flash * 0.35) + ')';
        ctx.fillRect(0, 0, VW, VH);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function sky() {
    var g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(0.45, C.skyMid);
    g.addColorStop(0.82, C.skyLow);
    g.addColorStop(1, C.skyGlow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    /* Warm sun-glow so the palette is not uniformly cool. */
    var r = ctx.createRadialGradient(VW * 0.76, VH * 0.2, 10, VW * 0.76, VH * 0.2, 300);
    r.addColorStop(0, 'rgba(255,214,140,0.35)');
    r.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, VW, VH);
  }

  function parallax() {
    var layers = [
      { c: C.far,  s: 0.25, h: 150, step: 340, amp: 60 },
      { c: C.mid,  s: 0.45, h: 105, step: 250, amp: 44 },
      { c: C.near, s: 0.68, h: 72,  step: 180, amp: 30 }
    ];
    for (var li = 0; li < layers.length; li++) {
      var l = layers[li];
      var ox = cam.x * (1 - l.s);
      ctx.fillStyle = l.c;
      ctx.beginPath();
      var base = cam.y + VH;
      ctx.moveTo(cam.x - 40, base);
      var start = Math.floor((cam.x - 40) / l.step) * l.step;
      for (var x = start; x < cam.x + VW + l.step; x += l.step) {
        var px = x + ox % l.step;
        ctx.lineTo(px, base - l.h - Math.sin(x * 0.013) * l.amp);
        ctx.lineTo(px + l.step / 2, base - l.h * 0.45);
      }
      ctx.lineTo(cam.x + VW + 40, base);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPlatforms() {
    for (var i = 0; i < L._plat.length; i++) {
      var p = L._plat[i];
      if (p.gone) continue;
      if (p.x + p.w < cam.x - 60 || p.x > cam.x + VW + 60) continue;  // cull

      var body = C.solid, top = C.solidTop;
      if (p.type === 'move') { body = C.move; top = C.moveTop; }
      if (p.type === 'crumble') {
        body = C.crumble; top = C.crumbleTop;
        if (p.timer > 0) {
          /* Shake harder the closer it is to giving way — the warning IS the
             mechanic. The old "deceptive" platform gave none at all. */
          var w = p.timer / 34;
          ctx.save();
          ctx.translate((Math.random() - 0.5) * w * 3.5, (Math.random() - 0.5) * w * 3.5);
        }
      }

      ctx.fillStyle = body;
      roundRect(p.x, p.y, p.w, p.h, 4);
      ctx.fill();
      ctx.fillStyle = top;
      roundRect(p.x, p.y, p.w, 5, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(143,208,255,0.30)';
      ctx.fillRect(p.x + 3, p.y + p.h - 2, p.w - 6, 1.5);

      if (p.type === 'move') {
        ctx.fillStyle = 'rgba(63,208,200,0.8)';
        var cx = p.x + p.w / 2, cy = p.y + p.h / 2 + 1;
        tri(cx - 12, cy, 5, p.axis === 'y' ? 'up' : 'left');
        tri(cx + 12, cy, 5, p.axis === 'y' ? 'down' : 'right');
      }
      if (p.type === 'crumble' && p.timer > 0) ctx.restore();
    }
  }

  function tri(x, y, r, dir) {
    ctx.beginPath();
    if (dir === 'left')  { ctx.moveTo(x - r, y); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y + r); }
    if (dir === 'right') { ctx.moveTo(x + r, y); ctx.lineTo(x - r, y - r); ctx.lineTo(x - r, y + r); }
    if (dir === 'up')    { ctx.moveTo(x, y - r); ctx.lineTo(x - r, y + r); ctx.lineTo(x + r, y + r); }
    if (dir === 'down')  { ctx.moveTo(x, y + r); ctx.lineTo(x - r, y - r); ctx.lineTo(x + r, y - r); }
    ctx.closePath(); ctx.fill();
  }

  function drawSpikes() {
    for (var i = 0; i < L._spikes.length; i++) {
      var s = L._spikes[i];
      if (s.x + s.w < cam.x - 60 || s.x > cam.x + VW + 60) continue;
      var n = Math.max(1, Math.round(s.w / 16));
      var w = s.w / n;
      for (var k = 0; k < n; k++) {
        var x = s.x + k * w;
        ctx.beginPath();
        if (s.dir === 'down') {
          ctx.moveTo(x, s.y); ctx.lineTo(x + w, s.y); ctx.lineTo(x + w / 2, s.y + s.h);
        } else {
          ctx.moveTo(x, s.y + s.h); ctx.lineTo(x + w, s.y + s.h); ctx.lineTo(x + w / 2, s.y);
        }
        ctx.closePath();
        ctx.fillStyle = C.spike; ctx.fill();
        ctx.strokeStyle = C.spikeHi; ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
  }

  function drawCheckpoints() {
    for (var i = 0; i < L._checks.length; i++) {
      var c = L._checks[i];
      if (c.x < cam.x - 60 || c.x > cam.x + VW + 60) continue;
      var t = Date.now() / 400;
      ctx.strokeStyle = c.hit ? C.beacon : 'rgba(63,208,200,0.42)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - 46); ctx.stroke();
      var pulse = c.hit ? 8 + Math.sin(t) * 3 : 6;
      ctx.fillStyle = c.hit ? C.beacon : 'rgba(63,208,200,0.30)';
      ctx.beginPath(); ctx.arc(c.x, c.y - 50, pulse, 0, 6.283); ctx.fill();
      if (c.hit) {
        ctx.globalAlpha = 0.28;
        ctx.beginPath(); ctx.arc(c.x, c.y - 50, pulse + 8 + Math.sin(t) * 4, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawGoal() {
    if (!L.goal) return;
    var g = L.goal, t = Date.now() / 300;
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = C.goal;
    ctx.beginPath(); ctx.arc(g.x, g.y - 6, 42 + Math.sin(t) * 6, 0, 6.283); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.goal; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(g.x - 22, g.y + 34); ctx.lineTo(g.x - 22, g.y - 34);
    ctx.lineTo(g.x + 22, g.y - 34); ctx.lineTo(g.x + 22, g.y + 34);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,217,128,0.20)';
    ctx.fillRect(g.x - 22, g.y - 34, 44, 68);
    ctx.fillStyle = C.goal;
    ctx.font = '600 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('S', g.x, g.y + 7);
  }

  function drawOrbs() {
    var i, o;
    for (i = 0; i < L._orbs.length; i++) {
      o = L._orbs[i];
      if (o.got) continue;
      if (o.x < cam.x - 40 || o.x > cam.x + VW + 40) continue;
      var b = Math.sin(o.t) * 3;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.arc(o.x, o.y + b, 14, 0, 6.283); ctx.fill();
      ctx.restore();
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.arc(o.x, o.y + b, 7, 0, 6.283); ctx.fill();
      ctx.fillStyle = C.goldHi;
      ctx.beginPath(); ctx.arc(o.x - 2, o.y + b - 2, 3, 0, 6.283); ctx.fill();
    }
    if (L._prism && !L._prism.got) {
      var p = L._prism, bb = Math.sin(p.t) * 4;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = C.prism;
      ctx.beginPath(); ctx.arc(p.x, p.y + bb, 24, 0, 6.283); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(p.x, p.y + bb);
      ctx.rotate(p.t * 0.5);
      ctx.fillStyle = C.prism;
      ctx.beginPath();
      ctx.moveTo(0, -13); ctx.lineTo(11, 0); ctx.lineTo(0, 13); ctx.lineTo(-11, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.prismHi;
      ctx.beginPath();
      ctx.moveTo(0, -13); ctx.lineTo(11, 0); ctx.lineTo(0, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer() {
    var sq = player.squash;
    var w = PW * (1 + sq * 0.22), h = PH * (1 - sq * 0.22);
    var x = player.x + (PW - w) / 2, y = player.y + (PH - h);

    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = C.playerAcc;
    ctx.beginPath(); ctx.ellipse(player.x + PW / 2, player.y + PH, 16, 5, 0, 0, 6.283); ctx.fill();
    ctx.restore();

    ctx.fillStyle = C.player;
    roundRect(x, y, w, h, 7); ctx.fill();
    ctx.fillStyle = C.playerLo;
    roundRect(x, y + h * 0.58, w, h * 0.42, 7); ctx.fill();

    /* Visor faces travel direction — the only orientation cue needed. */
    ctx.fillStyle = C.playerAcc;
    var vx = x + (player.facing > 0 ? w * 0.46 : w * 0.14);
    roundRect(vx, y + h * 0.2, w * 0.40, h * 0.22, 3); ctx.fill();

    if (!player.onGround) {
      ctx.strokeStyle = 'rgba(245,197,66,0.55)';
      ctx.lineWidth = 2;
      roundRect(x - 2, y - 2, w + 4, h + 4, 9); ctx.stroke();
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPops() {
    ctx.textAlign = 'center';
    ctx.font = '700 15px "Jost", system-ui, sans-serif';
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i];
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ═══════════════════════════════════════════════════════════════════════
     HUD + SCREENS
     ═══════════════════════════════════════════════════════════════════════ */
  function setText(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }

  function updateHUD() {
    setText('hud-level', 'Stage ' + (idx + 1) + '/' + levels.length);
    setText('hud-name', L ? L.name : '');
    setText('hud-orbs', orbs + '/' + orbsTotal);
    setText('hud-score', String(runScore));
    var lifeEl = document.getElementById('hud-lives');
    if (lifeEl) {
      lifeEl.textContent = '◆'.repeat(Math.max(0, lives));
      lifeEl.setAttribute('aria-label', lives + ' lives remaining');
    }
  }

  function showEl(id) { var e = document.getElementById(id); if (e) e.hidden = false; }
  function hideEl(id) { var e = document.getElementById(id); if (e) e.hidden = true; }

  function hideAll() {
    var s = document.querySelectorAll('.screen');
    for (var i = 0; i < s.length; i++) s[i].hidden = true;
  }

  function show(id) {
    hideAll();
    var e = document.getElementById(id);
    if (e) {
      e.hidden = false;
      var f = e.querySelector('button, a[href]');
      if (f) setTimeout(function () { f.focus(); }, 40);
    }
  }

  function buildLevelSelect() {
    var wrap = document.getElementById('level-select');
    if (!wrap || !levels) return;
    wrap.innerHTML = '';
    levels.forEach(function (lv, i) {
      var unlocked = (i + 1) <= save.unlocked;
      var b = document.createElement('button');
      b.className = 'lvl' + (unlocked ? '' : ' locked');
      b.type = 'button';
      b.disabled = !unlocked;
      var best = save.best['L' + lv.id];
      b.innerHTML = '<span class="lvl-n">' + (i + 1) + '</span>' +
                    '<span class="lvl-name">' + lv.name + '</span>' +
                    '<span class="lvl-best">' + (best ? best.toLocaleString() : (unlocked ? 'Not played' : 'Locked')) + '</span>';
      b.setAttribute('aria-label',
        unlocked ? ('Play stage ' + (i + 1) + ', ' + lv.name + '. ' + lv.idea)
                 : ('Stage ' + (i + 1) + ' locked. Finish the previous stage first.'));
      if (unlocked) b.addEventListener('click', function () { score = 0; startLevel(i); });
      wrap.appendChild(b);
    });
    setText('menu-best', save.totalScore ? save.totalScore.toLocaleString() : '0');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     INPUT
     ═══════════════════════════════════════════════════════════════════════ */
  var GAME_KEYS = { ArrowLeft:1, ArrowRight:1, ArrowUp:1, ArrowDown:1, ' ':1, Spacebar:1 };

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      keys[e.key] = true;
      /* Only swallow the keys the game uses, and only while playing, so Tab
         and browser shortcuts keep working everywhere else. */
      if (state === 'playing' && GAME_KEYS[e.key]) e.preventDefault();
      if (e.key === 'm' || e.key === 'M') setMuted(!muted);
      if (e.key === 'Escape' && state === 'playing') pause();
    });
    window.addEventListener('keyup', function (e) { keys[e.key] = false; });
    window.addEventListener('blur', function () { keys = {}; touch.l = touch.r = touch.j = false; });

    bindTouch('btn-left',  'l');
    bindTouch('btn-right', 'r');
    bindTouch('btn-jump',  'j');
  }

  function bindTouch(id, prop) {
    var el = document.getElementById(id);
    if (!el) return;
    function on(e) { touch[prop] = true; e.preventDefault(); }
    function off(e) { touch[prop] = false; e.preventDefault(); }
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
    /* Keyboard reachable too — the on-screen pad is not mouse/touch-only. */
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { touch[prop] = true; e.preventDefault(); }
    });
    el.addEventListener('keyup', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { touch[prop] = false; e.preventDefault(); }
    });
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    hideEl('hud'); hideEl('touch-controls');
    show('screen-pause');
  }

  function resume() {
    state = 'playing';
    hideAll();
    showEl('hud'); showEl('touch-controls');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════════════════ */
  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  function on(id, fn) {
    var e = document.getElementById(id);
    if (e) e.addEventListener('click', fn);
  }

  function init() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { alpha: false });

    try {
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {}

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });

    bindInput();
    setMuted(muted);

    on('btn-play',    function () { score = 0; startLevel(Math.min(save.unlocked, levels.length) - 1); });
    on('btn-play-1',  function () { score = 0; startLevel(0); });
    on('btn-next',    function () {
      if (idx >= levels.length - 1) { show('screen-complete'); return; }
      startLevel(idx + 1);
    });
    on('btn-retry',   function () { startLevel(idx); });
    on('btn-menu',    function () { state = 'menu'; buildLevelSelect(); show('screen-menu'); });
    on('btn-menu-2',  function () { state = 'menu'; buildLevelSelect(); show('screen-menu'); });
    on('btn-menu-3',  function () { state = 'menu'; buildLevelSelect(); show('screen-menu'); });
    on('btn-menu-4',  function () { state = 'menu'; buildLevelSelect(); show('screen-menu'); });
    on('btn-resume',  resume);
    on('btn-mute',    function () { setMuted(!muted); });
    on('btn-reset',   function () {
      save = { unlocked: 1, best: {}, totalScore: 0 };
      writeSave(save);
      buildLevelSelect();
    });

    loadLevels();
    loop();
  }

  /* Test hook. Read-only view of game state plus the few actions a harness
     needs, so browser tests can assert on real gameplay rather than pixels. */
  window.__S5 = {
    get state() { return state; },
    get level() { return L; },
    get idx() { return idx; },
    get player() { return player; },
    get lives() { return lives; },
    get orbs() { return orbs; },
    get orbsTotal() { return orbsTotal; },
    get score() { return runScore; },
    get levelCount() { return levels ? levels.length : 0; },
    get save() { return save; },
    start: function (i) { score = 0; startLevel(i); },
    hold: function (k, v) { touch[k] = v; },
    teleport: function (x, y) { player.x = x; player.y = y; player.vx = 0; player.vy = 0; },
    setMuted: setMuted,
    clearSave: function () { save = { unlocked:1, best:{}, totalScore:0 }; writeSave(save); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
