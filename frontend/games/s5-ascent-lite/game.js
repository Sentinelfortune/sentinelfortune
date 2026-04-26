/* ═══════════════════════════════════════════════════════════════
   S.5 JUMP: ASCENT — Game Engine
   Vanilla JS · No dependencies · GitHub Pages compatible
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── CONSTANTS ──────────────────────────────────────────────── */
  var WORLD_W    = 360;
  var PLAYER_W   = 22;
  var PLAYER_H   = 36;
  var GRAVITY    = 0.50;
  var JUMP_FORCE = -12;
  var MOVE_SPEED = 3.5;
  var COIN_R     = 6;
  var PORTAL_R   = 22;

  /* ── COLOURS ────────────────────────────────────────────────── */
  var C = {
    bg:         '#03060e',
    star:       'rgba(232,228,220,',
    gold:       '#c8a84b',
    gold2:      '#e8c86a',
    white:      '#e8e4dc',
    muted:      '#7a8099',
    danger:     '#c83a2a',
    teal:       '#2a9ab0',

    pStable:    '#142238',
    pFrag:      '#2e1808',
    pDec:       '#122030',
    pMove:      '#082830',
    pBonus:     '#28280a',

    eStable:    '#c8a84b',
    eFrag:      '#c86428',
    eDec:       '#3a78a8',
    eMove:      '#2a9ab0',
    eBonus:     '#f0d060',
    eDanger:    '#c83a2a',

    player:     '#07101e',
    playerGlow: 'rgba(200,168,75,',
  };

  /* ── STATE ──────────────────────────────────────────────────── */
  var canvas, ctx;
  var state       = 'loading'; /* loading | menu | playing | levelComplete | gameOver | threshold */
  var levelsData  = null;
  var currentIdx  = 0;
  var levelDef    = null;
  var score       = 0;
  var totalGold   = 0;
  var levelGold   = 0;
  var levelScore  = 0;
  var bestHeight  = 0;
  var frameCount  = 0;

  /* ── PLAYER ─────────────────────────────────────────────────── */
  var player = {
    x: 0, y: 0, vx: 0, vy: 0,
    onGround: false,
    coyoteTime: 0,
    facing: 1,
    glowLevel: 0   /* 0 = none, 0.5 = outline, 1 = full */
  };

  /* ── CAMERA ─────────────────────────────────────────────────── */
  var cameraY = 0;

  /* ── LEVEL OBJECTS ──────────────────────────────────────────── */
  var platforms = [];
  var coins     = [];
  var traps     = [];
  var portal    = null;

  /* ── PARTICLES ──────────────────────────────────────────────── */
  var particles = [];

  /* ── STARS (background) ─────────────────────────────────────── */
  var stars = [];

  /* ── INPUT ──────────────────────────────────────────────────── */
  var keys      = {};
  var touchLeft  = false;
  var touchRight = false;
  var touchJump  = false;
  var prevJump   = false;

  /* ══════════════════════════════════════════════════════════════
     CANVAS SIZING
  ══════════════════════════════════════════════════════════════ */
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    /* Regenerate stars on resize */
    generateStars();
  }

  /* ══════════════════════════════════════════════════════════════
     STAR FIELD
  ══════════════════════════════════════════════════════════════ */
  function generateStars() {
    stars = [];
    var count = Math.floor((canvas.width * canvas.height) / 3000);
    for (var i = 0; i < count; i++) {
      stars.push({
        x:    Math.random() * canvas.width,
        y:    Math.random() * canvas.height,
        r:    Math.random() * 1.1 + 0.2,
        a:    Math.random() * 0.6 + 0.1,
        twinkle: Math.random() * Math.PI * 2
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════
     SCALE HELPER  (logical 360-unit coords → canvas pixels)
  ══════════════════════════════════════════════════════════════ */
  function scale() {
    return canvas.width / WORLD_W;
  }

  /* ══════════════════════════════════════════════════════════════
     LOAD LEVELS
  ══════════════════════════════════════════════════════════════ */
  function loadLevels() {
    fetch('levels.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        levelsData = data;
        state = 'menu';
        showScreen('screen-menu');
      })
      .catch(function () {
        /* Fallback: show menu anyway (levels will be null until retried) */
        state = 'menu';
        showScreen('screen-menu');
      });
  }

  /* ══════════════════════════════════════════════════════════════
     START / LOAD LEVEL
  ══════════════════════════════════════════════════════════════ */
  function startGame() {
    currentIdx  = 0;
    score       = 0;
    totalGold   = 0;
    loadLevel(0);
  }

  function loadLevel(idx) {
    if (!levelsData) return;
    currentIdx  = idx;
    levelDef    = levelsData.levels[idx];
    levelGold   = 0;
    levelScore  = 0;
    bestHeight  = 0;
    frameCount  = 0;

    /* Player */
    player.x         = levelDef.startX;
    player.y         = levelDef.startY;
    player.vx        = 0;
    player.vy        = 0;
    player.onGround  = false;
    player.coyoteTime = 0;
    player.facing    = 1;
    player.glowLevel = idx >= 4 ? 1.0 : idx >= 2 ? 0.4 : 0.0;

    /* Platform instances */
    platforms = levelDef.platforms.map(function (p) {
      return Object.assign({}, p, {
        broken:     false,
        breakTimer: 0,
        offset:     0,
        dir:        1
      });
    });

    /* Coins */
    coins = levelDef.coins.map(function (c) {
      return Object.assign({}, c, { collected: false, bob: Math.random() * Math.PI * 2 });
    });

    /* Traps */
    traps = (levelDef.traps || []).map(function (t) {
      return Object.assign({}, t);
    });

    /* Portal */
    portal = {
      x:     levelDef.portalX,
      y:     levelDef.portalY,
      pulse: 0
    };

    /* Camera */
    cameraY = player.y - canvas.height / scale() * 0.6;

    /* Particles */
    particles = [];

    /* UI */
    hideAllScreens();
    showEl('hud');
    showEl('mobile-controls');
    updateHUD();
    state = 'playing';
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN LOOP
  ══════════════════════════════════════════════════════════════ */
  function gameLoop() {
    frameCount++;
    if (state === 'playing') {
      update();
    }
    render();
    requestAnimationFrame(gameLoop);
  }

  /* ══════════════════════════════════════════════════════════════
     UPDATE
  ══════════════════════════════════════════════════════════════ */
  function update() {
    var movingLeft  = keys['ArrowLeft']  || keys['a'] || keys['A'] || touchLeft;
    var movingRight = keys['ArrowRight'] || keys['d'] || keys['D'] || touchRight;
    var jumpHeld    = keys['ArrowUp'] || keys[' '] || keys['w'] || keys['W'] || touchJump;
    var jumpPressed = jumpHeld && !prevJump;
    prevJump = jumpHeld;

    /* ── Horizontal ── */
    if (movingLeft) {
      player.vx   = -MOVE_SPEED;
      player.facing = -1;
    } else if (movingRight) {
      player.vx   = MOVE_SPEED;
      player.facing = 1;
    } else {
      player.vx *= 0.75; /* friction */
      if (Math.abs(player.vx) < 0.1) player.vx = 0;
    }

    /* ── Gravity ── */
    player.vy += GRAVITY;
    if (player.vy > 20) player.vy = 20; /* terminal velocity */

    /* ── Coyote time ── */
    if (player.onGround) {
      player.coyoteTime = 8;
    } else if (player.coyoteTime > 0) {
      player.coyoteTime--;
    }

    /* ── Jump ── */
    if (jumpPressed && player.coyoteTime > 0 && player.vy >= 0) {
      player.vy         = JUMP_FORCE;
      player.onGround   = false;
      player.coyoteTime = 0;
      spawnParticles(player.x + PLAYER_W / 2, player.y + PLAYER_H, 'jump');
    }

    /* ── Move ── */
    player.x += player.vx;
    player.y += player.vy;

    /* Wrap horizontally */
    if (player.x + PLAYER_W < 0)    player.x = WORLD_W;
    if (player.x > WORLD_W)          player.x = -PLAYER_W;

    /* ── Platform collision ── */
    player.onGround = false;

    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (p.broken) continue;

      /* Animate moving platforms */
      if (p.type === 'moving') {
        p.offset += p.dir * (p.moveSpeed || 1);
        var range = p.moveRange || 60;
        if (p.offset >  range) { p.offset =  range; p.dir = -1; }
        if (p.offset < -range) { p.offset = -range; p.dir =  1; }
      }

      var px = p.x + (p.type === 'moving' ? p.offset : 0);
      var py = p.y;

      /* Previous frame bottom (before this frame's movement) */
      var prevBottom = (player.y + PLAYER_H) - player.vy;
      var currBottom =  player.y + PLAYER_H;

      var horizOverlap = (player.x + PLAYER_W > px) && (player.x < px + p.w);

      if (player.vy >= 0 &&
          prevBottom <= py &&
          currBottom >= py &&
          horizOverlap) {

        /* Trap platform → instant death */
        if (p.type === 'trap') {
          killPlayer();
          return;
        }

        /* Land */
        player.y        = py - PLAYER_H;
        player.vy       = 0;
        player.onGround = true;

        /* Carry with moving platform */
        if (p.type === 'moving') {
          player.x += p.dir * (p.moveSpeed || 1);
        }

        /* Fragile: breaks after ~0.55 s */
        if (p.type === 'fragile') {
          if (!p.breakTimer) p.breakTimer = 1;
          p.breakTimer++;
          if (p.breakTimer > 33) {
            p.broken = true;
            spawnParticles(px + p.w / 2, py, 'break');
          }
        }

        /* Deceptive: breaks faster (~0.3 s) with no warning */
        if (p.type === 'deceptive') {
          if (!p.breakTimer) p.breakTimer = 1;
          p.breakTimer++;
          if (p.breakTimer > 18) {
            p.broken = true;
            spawnParticles(px + p.w / 2, py, 'break');
          }
        }
      } else if (p.type === 'fragile' && p.breakTimer > 0 && !player.onGround) {
        /* Reset fragile timer if player left before it broke */
        if (p.breakTimer < 33 && !horizOverlap) {
          p.breakTimer = 0;
        }
      }
    }

    /* ── Trap (static hazard) collision ── */
    for (var j = 0; j < traps.length; j++) {
      var t = traps[j];
      if (player.x + PLAYER_W > t.x &&
          player.x             < t.x + t.w &&
          player.y + PLAYER_H  > t.y &&
          player.y             < t.y + t.h) {
        killPlayer();
        return;
      }
    }

    /* ── Coin collection ── */
    for (var k = 0; k < coins.length; k++) {
      var c = coins[k];
      if (c.collected) continue;
      var dx = (player.x + PLAYER_W / 2) - c.x;
      var dy = (player.y + PLAYER_H / 2) - c.y;
      if (Math.abs(dx) < PLAYER_W && Math.abs(dy) < PLAYER_H) {
        c.collected = true;
        totalGold++;
        levelGold++;
        levelScore += 100;
        spawnParticles(c.x, c.y, 'coin');
        updateHUD();
      }
    }

    /* ── Portal collision ── */
    if (portal) {
      portal.pulse = (portal.pulse + 0.03) % (Math.PI * 2);
      var dxp = (player.x + PLAYER_W / 2) - portal.x;
      var dyp = (player.y + PLAYER_H / 2) - portal.y;
      if (Math.sqrt(dxp * dxp + dyp * dyp) < PORTAL_R + 10) {
        reachPortal();
        return;
      }
    }

    /* ── Fall out of level ── */
    if (player.y > levelDef.levelHeight + 300) {
      killPlayer();
      return;
    }

    /* ── Height score ── */
    var heightUnits = Math.max(0, levelDef.levelHeight - player.y);
    if (heightUnits > bestHeight) {
      bestHeight  = heightUnits;
      levelScore  = Math.floor(bestHeight / 10) + levelGold * 100;
    }
    score = levelScore + (currentIdx * 2000);
    updateHUD();

    /* ── Camera (smooth follow) ── */
    var sc       = scale();
    var viewH    = canvas.height / sc;
    var targetCY = player.y - viewH * 0.55;
    cameraY     += (targetCY - cameraY) * 0.1;

    /* ── Particles ── */
    for (var q = particles.length - 1; q >= 0; q--) {
      var pt = particles[q];
      pt.x  += pt.vx;
      pt.y  += pt.vy;
      pt.vy += 0.15;
      pt.life--;
      pt.alpha = pt.life / pt.maxLife;
      if (pt.life <= 0) particles.splice(q, 1);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     KILL PLAYER
  ══════════════════════════════════════════════════════════════ */
  function killPlayer() {
    if (state !== 'playing') return;
    state = 'dying';
    spawnParticles(player.x + PLAYER_W / 2, player.y + PLAYER_H / 2, 'death');
    setTimeout(function () {
      state = 'gameOver';
      hideEl('hud');
      hideEl('mobile-controls');
      showScreen('screen-gameover');
    }, 900);
  }

  /* ══════════════════════════════════════════════════════════════
     REACH PORTAL
  ══════════════════════════════════════════════════════════════ */
  function reachPortal() {
    if (state !== 'playing') return;
    state = 'levelComplete';
    spawnParticles(portal.x, portal.y, 'portal');

    var isLast = (currentIdx >= levelsData.levels.length - 1);

    setTimeout(function () {
      hideEl('hud');
      hideEl('mobile-controls');

      if (isLast) {
        showScreen('screen-threshold');
      } else {
        var lc = levelsData.levels[currentIdx];
        document.getElementById('lc-name').textContent    = lc.name;
        document.getElementById('lc-subtitle').textContent = lc.subtitle;
        document.getElementById('lc-gold').textContent     = levelGold;
        document.getElementById('lc-score').textContent    = score;
        showScreen('screen-level-complete');
      }
    }, 700);
  }

  /* ══════════════════════════════════════════════════════════════
     PARTICLES
  ══════════════════════════════════════════════════════════════ */
  function spawnParticles(x, y, type) {
    var configs = {
      coin:   { count: 8,  colors: [C.gold, C.gold2],     speed: 2.5, life: 35 },
      jump:   { count: 5,  colors: ['#1a3a5a', '#2a5a8a'], speed: 1.5, life: 22 },
      break:  { count: 10, colors: [C.gold, '#8a5a2a'],    speed: 2.0, life: 30 },
      death:  { count: 18, colors: ['#1a3a6a', '#0a1a3a'], speed: 3.5, life: 45 },
      portal: { count: 20, colors: [C.gold, C.gold2, '#fff'], speed: 4.0, life: 55 }
    };
    var cfg = configs[type] || configs.coin;
    for (var i = 0; i < cfg.count; i++) {
      var angle = (Math.PI * 2 * i / cfg.count) + Math.random() * 0.4;
      var spd   = cfg.speed * (0.5 + Math.random());
      particles.push({
        x:     x,
        y:     y,
        vx:    Math.cos(angle) * spd,
        vy:    Math.sin(angle) * spd - (type === 'portal' ? 2 : 0.5),
        color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
        r:     1.5 + Math.random() * 2.5,
        life:  cfg.life,
        maxLife: cfg.life,
        alpha: 1
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  function render() {
    var W  = canvas.width;
    var H  = canvas.height;
    var sc = scale();

    ctx.clearRect(0, 0, W, H);

    /* Background */
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    /* Stars */
    renderStars();

    /* Tower wall lines */
    renderTowerWalls(sc);

    /* Scaled world */
    ctx.save();
    ctx.scale(sc, sc);
    ctx.translate(0, -cameraY);

    /* Traps */
    for (var j = 0; j < traps.length; j++) {
      renderTrap(traps[j]);
    }

    /* Platforms */
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (p.broken) continue;
      var px = p.x + (p.type === 'moving' ? p.offset : 0);
      renderPlatform(px, p.y, p.w, p.h, p.type, p.breakTimer);
    }

    /* Coins */
    for (var k = 0; k < coins.length; k++) {
      if (!coins[k].collected) renderCoin(coins[k]);
    }

    /* Portal */
    if (portal) renderPortal();

    /* Player */
    if (state !== 'dying' || Math.floor(frameCount / 4) % 2 === 0) {
      renderPlayer();
    }

    /* Particles */
    renderParticles();

    ctx.restore();

    /* Portal direction indicator */
    if (state === 'playing' || state === 'dying') {
      renderPortalIndicator(sc);
    }
  }

  /* ── Background stars ── */
  function renderStars() {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.twinkle += 0.02;
      var a = s.a * (0.7 + 0.3 * Math.sin(s.twinkle));
      ctx.globalAlpha = a;
      ctx.fillStyle   = C.white;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ── Tower wall lines (decorative) ── */
  function renderTowerWalls(sc) {
    var lx = Math.round(6  * sc);
    var rx = Math.round((WORLD_W - 6) * sc);
    ctx.strokeStyle = 'rgba(200,168,75,0.06)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(lx, 0); ctx.lineTo(lx, canvas.height);
    ctx.moveTo(rx, 0); ctx.lineTo(rx, canvas.height);
    ctx.stroke();

    /* Subtle gold gradient on sides */
    var gradL = ctx.createLinearGradient(0, 0, lx * 2.5, 0);
    gradL.addColorStop(0,   'rgba(200,168,75,0.07)');
    gradL.addColorStop(1,   'rgba(200,168,75,0.00)');
    ctx.fillStyle = gradL;
    ctx.fillRect(0, 0, lx * 2.5, canvas.height);

    var gradR = ctx.createLinearGradient(rx - lx * 0.5, 0, canvas.width, 0);
    gradR.addColorStop(0,   'rgba(200,168,75,0.00)');
    gradR.addColorStop(1,   'rgba(200,168,75,0.07)');
    ctx.fillStyle = gradR;
    ctx.fillRect(rx - lx * 0.5, 0, canvas.width, canvas.height);
  }

  /* ── Platform ── */
  function renderPlatform(x, y, w, h, type, breakTimer) {
    var fills = {
      stable:    C.pStable,
      fragile:   C.pFrag,
      deceptive: C.pDec,
      moving:    C.pMove,
      bonus:     C.pBonus,
      trap:      '#280808'
    };
    var edges = {
      stable:    C.eStable,
      fragile:   C.eFrag,
      deceptive: C.eDec,
      moving:    C.eMove,
      bonus:     C.eBonus,
      trap:      C.eDanger
    };

    var fill = fills[type]  || C.pStable;
    var edge = edges[type]  || C.eStable;

    /* Shake if near breaking */
    var shakeX = 0;
    if (breakTimer > 20) {
      shakeX = Math.sin(breakTimer * 1.2) * 2;
    }

    /* Body */
    ctx.fillStyle = fill;
    ctx.fillRect(x + shakeX, y, w, h);

    /* Top edge accent */
    ctx.fillStyle = edge;
    ctx.fillRect(x + shakeX, y, w, 3);

    /* Subtle inner glow line for stable/moving */
    if (type === 'stable' || type === 'moving') {
      ctx.fillStyle = 'rgba(232,228,220,0.04)';
      ctx.fillRect(x + shakeX + 1, y + 4, w - 2, 1);
    }

    /* Crack marks for fragile */
    if (type === 'fragile' && breakTimer > 10) {
      ctx.strokeStyle = 'rgba(200,100,40,0.45)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(x + shakeX + w * 0.3, y + 3);
      ctx.lineTo(x + shakeX + w * 0.25, y + h);
      ctx.moveTo(x + shakeX + w * 0.65, y + 3);
      ctx.lineTo(x + shakeX + w * 0.7,  y + h);
      ctx.stroke();
    }

    /* Spike hazard for trap platform */
    if (type === 'trap') {
      renderSpikes(x + shakeX, y, w, false);
    }
  }

  /* ── Static trap hazard ── */
  function renderTrap(t) {
    ctx.fillStyle = '#200606';
    ctx.fillRect(t.x, t.y, t.w, t.h);
    renderSpikes(t.x, t.y, t.w, true);
  }

  function renderSpikes(x, y, w, pointsUp) {
    ctx.fillStyle = C.eDanger;
    var count = Math.max(1, Math.floor(w / 10));
    var sw    = w / count;
    for (var i = 0; i < count; i++) {
      var sx = x + i * sw + sw / 2;
      ctx.beginPath();
      if (pointsUp) {
        ctx.moveTo(sx, y);
        ctx.lineTo(sx - sw * 0.38, y + 10);
        ctx.lineTo(sx + sw * 0.38, y + 10);
      } else {
        ctx.moveTo(sx, y - 8);
        ctx.lineTo(sx - sw * 0.38, y);
        ctx.lineTo(sx + sw * 0.38, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ── Coin ── */
  function renderCoin(c) {
    c.bob += 0.05;
    var bobY = Math.sin(c.bob) * 3;
    var cx   = c.x;
    var cy   = c.y + bobY;

    /* Outer glow */
    ctx.globalAlpha = 0.25;
    ctx.fillStyle   = C.gold;
    ctx.beginPath();
    ctx.arc(cx, cy, COIN_R + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* Coin body (hexagonal approximation via arc) */
    ctx.fillStyle = C.gold2;
    ctx.beginPath();
    ctx.arc(cx, cy, COIN_R, 0, Math.PI * 2);
    ctx.fill();

    /* Inner shine */
    ctx.fillStyle = 'rgba(255,240,160,0.55)';
    ctx.beginPath();
    ctx.arc(cx - 1.5, cy - 1.5, COIN_R * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── Portal ── */
  function renderPortal() {
    var px    = portal.x;
    var py    = portal.y;
    var pulse = Math.sin(portal.pulse) * 0.25 + 0.75;
    var R     = PORTAL_R;

    /* Outer halo */
    var grad = ctx.createRadialGradient(px, py, 0, px, py, R * 2.8);
    grad.addColorStop(0,   'rgba(200,168,75,' + (0.55 * pulse) + ')');
    grad.addColorStop(0.5, 'rgba(200,168,75,' + (0.15 * pulse) + ')');
    grad.addColorStop(1,   'rgba(200,168,75,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, R * 2.8, 0, Math.PI * 2);
    ctx.fill();

    /* Portal disk */
    var innerGrad = ctx.createRadialGradient(px, py, 0, px, py, R);
    innerGrad.addColorStop(0,   'rgba(245,217,128,' + pulse + ')');
    innerGrad.addColorStop(0.6, 'rgba(200,168,75,'  + pulse + ')');
    innerGrad.addColorStop(1,   'rgba(180,148,55,'  + (0.7 * pulse) + ')');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(px, py, R, 0, Math.PI * 2);
    ctx.fill();

    /* Ring */
    ctx.strokeStyle = 'rgba(245,217,128,' + (0.8 * pulse) + ')';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, R + 6, 0, Math.PI * 2);
    ctx.stroke();

    /* Symbol inside */
    ctx.fillStyle   = 'rgba(3,6,14,' + (0.65 * pulse) + ')';
    ctx.font        = 'bold ' + Math.round(R * 0.9) + 'px Georgia,serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⬡', px, py);
  }

  /* ── Player ── */
  function renderPlayer() {
    var px = player.x;
    var py = player.y;
    var gl = player.glowLevel;

    ctx.save();

    /* Glow shadow */
    if (gl > 0) {
      ctx.shadowBlur  = 18 * gl;
      ctx.shadowColor = 'rgba(200,168,75,' + (gl * 0.7) + ')';
    }

    /* Body */
    ctx.fillStyle = C.player;
    ctx.fillRect(px + 3, py + 13, PLAYER_W - 6, PLAYER_H - 13);

    /* Head */
    ctx.beginPath();
    ctx.arc(px + PLAYER_W / 2, py + 8, 8, 0, Math.PI * 2);
    ctx.fill();

    /* Neck */
    ctx.fillRect(px + PLAYER_W / 2 - 3, py + 14, 6, 4);

    /* Gold outline accent (for glowing levels) */
    if (gl > 0) {
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = 'rgba(200,168,75,' + (gl * 0.65) + ')';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(px + PLAYER_W / 2, py + 8, 8.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(px + 3, py + 13, PLAYER_W - 6, PLAYER_H - 13);
    }

    ctx.restore();
  }

  /* ── Particles ── */
  function renderParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ── Portal direction indicator (when off-screen) ── */
  function renderPortalIndicator(sc) {
    if (!portal || !levelDef) return;

    var portalScreenY = (portal.y - cameraY) * sc;
    var playerScreenY = (player.y + PLAYER_H / 2 - cameraY) * sc;

    /* Only show when portal is above the viewport */
    if (portalScreenY > -20) return;

    var centerX = canvas.width / 2;
    var arrowY  = 60;

    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(Date.now() / 400);

    /* Arrow */
    ctx.fillStyle   = C.gold;
    ctx.strokeStyle = C.gold;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(centerX,       arrowY);
    ctx.lineTo(centerX - 8,   arrowY + 14);
    ctx.lineTo(centerX + 8,   arrowY + 14);
    ctx.closePath();
    ctx.fill();

    /* Distance label */
    var dist = Math.max(0, Math.round(player.y - portal.y));
    ctx.font        = '600 10px system-ui,sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle   = C.gold;
    ctx.fillText(dist + 'u', centerX, arrowY + 18);

    ctx.restore();
  }

  /* ══════════════════════════════════════════════════════════════
     HUD
  ══════════════════════════════════════════════════════════════ */
  function updateHUD() {
    document.getElementById('hud-score').textContent     = score;
    document.getElementById('hud-gold').textContent      = '⬡ ' + totalGold;
    document.getElementById('hud-level').textContent     = 'Level ' + (currentIdx + 1);
    document.getElementById('hud-level-name').textContent = levelDef ? levelDef.name : '';
  }

  /* ══════════════════════════════════════════════════════════════
     SCREEN HELPERS
  ══════════════════════════════════════════════════════════════ */
  function showEl(id)  { document.getElementById(id).classList.remove('hidden'); }
  function hideEl(id)  { document.getElementById(id).classList.add('hidden'); }

  function hideAllScreens() {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.add('hidden');
    }
  }

  function showScreen(id) {
    hideAllScreens();
    hideEl('hud');
    hideEl('mobile-controls');
    showEl(id);
  }

  /* ══════════════════════════════════════════════════════════════
     INPUT SETUP
  ══════════════════════════════════════════════════════════════ */
  function setupInput() {
    /* Keyboard */
    window.addEventListener('keydown', function (e) {
      keys[e.key] = true;
      /* Prevent arrow keys / space scrolling the page */
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key) !== -1) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', function (e) {
      keys[e.key] = false;
    });

    /* Touch / mouse helpers */
    function bindBtn(id, setTrue, setFalse) {
      var btn = document.getElementById(id);
      if (!btn) return;
      function on(e)  { e.preventDefault(); setTrue();  }
      function off(e) { e.preventDefault(); setFalse(); }
      btn.addEventListener('touchstart', on,  { passive: false });
      btn.addEventListener('touchend',   off, { passive: false });
      btn.addEventListener('touchcancel',off, { passive: false });
      btn.addEventListener('mousedown',  on);
      btn.addEventListener('mouseup',    off);
      btn.addEventListener('mouseleave', off);
    }

    bindBtn('btn-left',  function(){ touchLeft  = true;  },
                         function(){ touchLeft  = false; });
    bindBtn('btn-right', function(){ touchRight = true;  },
                         function(){ touchRight = false; });
    bindBtn('btn-jump',
      function(){ touchJump = true;  },
      function(){ touchJump = false; prevJump = false; }
    );

    /* Screen buttons */
    document.getElementById('btn-start').addEventListener('click', startGame);

    document.getElementById('btn-next-level').addEventListener('click', function () {
      loadLevel(currentIdx + 1);
    });

    document.getElementById('btn-retry').addEventListener('click', function () {
      loadLevel(currentIdx);
    });

    document.getElementById('btn-menu-go').addEventListener('click', function () {
      score = 0; totalGold = 0;
      showScreen('screen-menu');
    });

    document.getElementById('btn-restart-all').addEventListener('click', function () {
      startGame();
    });
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════ */
  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx    = canvas.getContext('2d');

    resize();
    generateStars();
    window.addEventListener('resize', resize);

    setupInput();
    loadLevels();

    requestAnimationFrame(gameLoop);
  }

  /* Boot */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}());
