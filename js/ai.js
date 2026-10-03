/* ============================================================
   РОМАН: ПИКСЕЛЬНОЕ ПРИКЛЮЧЕНИЕ — ai.js
   Враги, ИИ, боссы, бой
   ============================================================ */
var RP = (typeof window !== 'undefined')
  ? (window.RP = window.RP || {})
  : (globalThis.RP = globalThis.RP || {});

var ENEMY_DEF = {
  mutant: { hp: 3, spr: 'mutant', sw: 16, sh: 16, speed: 34, dmg: 1 },
  drone: { hp: 2, spr: 'drone', sw: 16, sh: 16, speed: 30, dmg: 1, fly: true, shoot: 1.7 },
  droneRed: { hp: 3, spr: 'droneRed', sw: 16, sh: 16, speed: 34, dmg: 1, fly: true, shoot: 1.3 },
  fog: { hp: 5, spr: 'fog', sw: 24, sh: 24, speed: 20, dmg: 1, fly: true },
  fogPurple: { hp: 5, spr: 'fogPurple', sw: 24, sh: 24, speed: 26, dmg: 1, fly: true },
  sphereling: { hp: 2, spr: 'sphereling', sw: 12, sh: 12, speed: 55, dmg: 1, bounce: true },
  car: { hp: 999, spr: 'car', sw: 24, sh: 14, speed: 62, dmg: 1, fly: true, car: true },
  carRed: { hp: 999, spr: 'carRed', sw: 24, sh: 14, speed: 62, dmg: 1, fly: true, car: true },
  fogBoss: { hp: 40, spr: 'fogBoss', sw: 32, sh: 32, speed: 26, dmg: 1, fly: true, boss: 'fog' },
  evil: { hp: 60, spr: 'evilBig', sw: 24, sh: 24, speed: 34, dmg: 1, boss: 'evil' },
  droneMaster: { hp: 70, spr: 'droneMaster', sw: 32, sh: 24, speed: 30, dmg: 1, fly: true, boss: 'drone' },
  queen: { hp: 100, spr: 'queen', sw: 32, sh: 32, speed: 24, dmg: 1, boss: 'queen' }
};

function spawnEnemy(d) {
  var base = ENEMY_DEF[d.t];
  if (!base) return null;
  if (base.boss && G.flags['boss_' + base.boss]) return null;
  var px = (d.px !== undefined) ? d.px : d.x * TILE + (TILE - base.sw) / 2;
  var py = (d.py !== undefined) ? d.py : d.y * TILE + (TILE - base.sh);
  var uid = (d.uid !== undefined) ? d.uid : enemyUidSeq++;
  var e = {
    t: d.t, def: base, uid: uid,
    x: px,
    y: py,
    hp: d.hp || base.hp, maxHp: d.hp || base.hp,
    spr: base.spr, sw: base.sw, sh: base.sh,
    speed: base.speed, dmg: base.dmg, fly: !!base.fly,
    boss: base.boss || null,
    frames: RP.SPR[base.spr],
    anim: Math.random() * 2, flash: 0, dead: false,
    homeX: px, homeY: py,
    shootT: Math.random() * 1.5, phaseT: 1 + Math.random() * 2,
    st: 'idle', stT: 0, wx: Math.random() * 60 - 30, wy: Math.random() * 60 - 30,
    wanderT: 1 + Math.random() * 2, vx: 0, vy: 0,
    axis: d.axis || 'x', min: d.min || 0, max: d.max || 10, cdir: d.dir || 1,
    seen: false, hitT: 0
  };
  if (e.boss) e.seen = !!G.flags['seen_' + e.boss];
  if (base.bounce) {
    var a = Math.random() * Math.PI * 2;
    e.vx = Math.cos(a) * e.speed; e.vy = Math.sin(a) * e.speed;
  }
  zone.enemies.push(e);
  return e;
}

function shoot(x, y, ang, speed, dmg, col) {
  bullets.push({
    x: x, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
    dmg: dmg || 1, friendly: false, life: 4, col: col || '#ffd76a'
  });
}
function ringShot(x, y, n, speed, off, col) {
  for (var i = 0; i < n; i++) shoot(x, y, off + i * Math.PI * 2 / n, speed, 1, col);
}

function damageEnemy(e, dmg, sx, sy) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = 0.12;
  floatTxt(e.x + e.sw / 2 - 6, e.y - 2, '-' + dmg, e.boss ? '#ff6a6a' : '#fff');
  sfx('hit');
  if (!e.boss && !e.def.car) {
    var a = Math.atan2(e.y - (sy || e.y), e.x - (sx || e.x - 1));
    moveEnemy(e, Math.cos(a) * 5, Math.sin(a) * 5);
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  e.dead = true;
  burst(e.x + e.sw / 2, e.y + e.sh / 2, e.boss ? '#ff5a5a' : '#c9e8b0', e.boss ? 30 : 12, e.boss ? 90 : 60);
  if (e.boss) {
    sfx('explosion');
    shake = 8;
    G.flags['boss_' + e.boss] = true;
    G.flags['seen_' + e.boss] = true;
    if (e.boss === 'fog') {
      G.keys.pass = true;
      toast('ПРОПУСК НА ФАБРИКУ получен!');
      sfx('key');
    } else if (e.boss === 'evil') {
      G.keys.key = true;
      toast('СФЕРНЫЙ КЛЮЧ получен!');
      sfx('key');
    } else if (e.boss === 'drone') {
      G.spheres += 20;
      toast('Дрон-Мастер уничтожен! +20 сфер');
      sfx('key');
    } else if (e.boss === 'queen') {
      toast('КОРОЛЕВА ПОВЕРЖЕНА! Иди к монитору');
      sfx('key');
    }
    saveGame();
  } else {
    sfx('die');
    if (!e.def.car && Math.random() < 0.28) {
      zone.drops.push({ x: e.x + e.sw / 2, y: e.y + e.sh / 2 });
    }
  }
}

function moveEnemy(e, dx, dy) {
  if (e.fly || e.def.car) {
    e.x += dx; e.y += dy;
    e.x = RP.clamp(e.x, 8, zone.w * TILE - e.sw - 8);
    e.y = RP.clamp(e.y, 8, zone.h * TILE - e.sh - 8);
    return;
  }
  var b = { x: e.x + 3, y: e.y + e.sh - 7, w: e.sw - 6, h: 7 };
  var hitX = false, hitY = false;
  if (dx !== 0) {
    var nx = b.x + dx;
    if (boxSolid(nx, b.y, b.w, b.h)) hitX = true; else e.x += dx;
  }
  if (dy !== 0) {
    var ny = b.y + dy;
    if (boxSolid(b.x, ny, b.w, b.h)) hitY = true; else e.y += dy;
  }
  e.x = RP.clamp(e.x, 0, zone.w * TILE - e.sw);
  e.y = RP.clamp(e.y, 0, zone.h * TILE - e.sh);
  return { hitX: hitX, hitY: hitY };
}

function checkBossIntros() {
  for (var i = 0; i < zone.enemies.length; i++) {
    var e = zone.enemies[i];
    if (e.dead || !e.boss || e.seen) continue;
    /* ближайший игрок (в кооп — любой) */
    var list = allPlayers(), bestP = null, bd = 85;
    for (var j = 0; j < list.length; j++) {
      var d = dist(list[j].x + 8, list[j].y + 8, e.x + e.sw / 2, e.y + e.sh / 2);
      if (d < bd) { bd = d; bestP = list[j]; }
    }
    if (!bestP) continue;
    e.seen = true;
    G.flags['seen_' + e.boss] = true;
    sfx('boss');
    var lines = RP.DIALOGS['boss_' + e.boss];
    if (lines) {
      /* кооп: если первым подошёл гость — диалог ему, хост не погружается */
      if (bestP !== player && bestP.conn && typeof NET !== 'undefined' && NET.sendTo)
        NET.sendTo(bestP.conn, { t: 'dlg', l: lines() });
      else startDialog(lines());
    }
    break;
  }
}

function activeBoss() {
  if (!zone) return null;
  for (var i = 0; i < zone.enemies.length; i++) {
    var e = zone.enemies[i];
    if (e.boss && !e.dead && e.seen) return e;
  }
  return null;
}

/* ---------- удар ближнего боя ---------- */
function playerAttack(p) {
  p = p || player;
  if (p.atkT > 0) return;
  p.atkT = 0.35;
  p.atkFlash = 0.16;
  sfx('attack');
  var box;
  if (p.dir === 'down') box = { x: p.x - 6, y: p.y + 10, w: 28, h: 16 };
  else if (p.dir === 'up') box = { x: p.x - 6, y: p.y - 10, w: 28, h: 16 };
  else if (p.dir === 'left') box = { x: p.x - 14, y: p.y + 2, w: 18, h: 14 };
  else box = { x: p.x + 10, y: p.y + 2, w: 18, h: 14 };
  burst(box.x + box.w / 2, box.y + box.h / 2, '#ffe9a0', 5, 45);
  for (var i = 0; i < zone.enemies.length; i++) {
    var e = zone.enemies[i];
    if (e.dead) continue;
    if (rectsOverlap(box.x, box.y, box.w, box.h, e.x + 2, e.y + 2, e.sw - 4, e.sh - 4)) {
      damageEnemy(e, 2, p.x + 8, p.y + 8);
    }
  }
  for (i = bullets.length - 1; i >= 0; i--) {
    var b = bullets[i];
    if (!b.friendly && rectsOverlap(box.x, box.y, box.w, box.h, b.x - 3, b.y - 3, 6, 6)) {
      burst(b.x, b.y, '#ffd76a', 4, 40);
      bullets.splice(i, 1);
    }
  }
}

/* ---------- обновление всех врагов ---------- */
function nearestPlayerXY(x, y) {
  var list = allPlayers(), best = list[0], bd = Infinity;
  for (var i = 0; i < list.length; i++) {
    if (!list[i]) continue;
    var d = dist(x, y, list[i].x + 8, list[i].y + 8);
    if (d < bd) { bd = d; best = list[i]; }
  }
  return { x: best.x + 8, y: best.y + 8 };
}
function updateEnemies(dt) {
  for (var i = zone.enemies.length - 1; i >= 0; i--) {
    var e = zone.enemies[i];
    if (e.dead) { zone.enemies.splice(i, 1); continue; }
    e.flash = Math.max(0, e.flash - dt);
    e.anim += dt * 6;
    e.hitT = Math.max(0, e.hitT - dt);
    var np = nearestPlayerXY(e.x + e.sw / 2, e.y + e.sh / 2);
    var pcx = np.x, pcy = np.y;
    if (e.def.car) { carAI(e, dt); }
    else if (e.boss === 'fog') fogBossAI(e, dt, pcx, pcy);
    else if (e.boss === 'evil') evilAI(e, dt, pcx, pcy);
    else if (e.boss === 'drone') masterAI(e, dt, pcx, pcy);
    else if (e.boss === 'queen') queenAI(e, dt, pcx, pcy);
    else {
      if (e.boss && !e.seen) { /* ждёт представления */ }
      else if (e.def.bounce) bounceAI(e, dt, pcx, pcy);
      else if (e.t === 'drone' || e.t === 'droneRed') droneAI(e, dt, pcx, pcy);
      else if (e.t === 'fog' || e.t === 'fogPurple') fogAI(e, dt, pcx, pcy);
      else chaseAI(e, dt, pcx, pcy);
    }
    /* контактный урон — любому игроку рядом */
    if (e.hitT <= 0) {
      var list = allPlayers();
      for (var j = 0; j < list.length; j++) {
        var pp = list[j];
        if (!pp || pp.iframes > 0) continue;
        if (rectsOverlap(feetBox(pp).x, feetBox(pp).y, 8, 7, e.x + 3, e.y + e.sh - 8, e.sw - 6, 8) &&
          rectsOverlap(pp.x + 3, pp.y + 2, 10, 14, e.x + 3, e.y + 3, e.sw - 6, e.sh - 6)) {
          hurtPlayer(e.dmg, e.x + e.sw / 2, e.y + e.sh / 2, pp);
          e.hitT = 0.6;
          break;
        }
      }
    }
  }
}

/* --- простое преследование --- */
function chaseAI(e, dt, pcx, pcy) {
  var d = dist(e.x, e.y, pcx, pcy);
  if (d < 100) {
    var a = Math.atan2(pcy - e.y - e.sh / 2, pcx - e.x - e.sw / 2);
    moveEnemy(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
  } else {
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.wanderT = 1 + Math.random() * 2;
      var ang = Math.random() * Math.PI * 2;
      e.wx = Math.cos(ang) * e.speed; e.wy = Math.sin(ang) * e.speed;
      if (Math.random() < 0.4) { e.wx = 0; e.wy = 0; }
    }
    moveEnemy(e, e.wx * dt, e.wy * dt);
  }
}

/* --- дрон --- */
function droneAI(e, dt, pcx, pcy) {
  var d = dist(e.x, e.y, pcx, pcy);
  var a = Math.atan2(pcy - e.y, pcx - e.x);
  var sp = e.speed;
  if (d > 78) moveEnemy(e, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
  else if (d < 46) moveEnemy(e, -Math.cos(a) * sp * dt, -Math.sin(a) * sp * dt);
  else {
    var side = a + Math.PI / 2;
    moveEnemy(e, Math.cos(side) * sp * 0.5 * dt * (e.anim % 4 < 2 ? 1 : -1), Math.sin(side) * sp * 0.5 * dt * (e.anim % 4 < 2 ? 1 : -1));
  }
  e.shootT -= dt;
  if (e.shootT <= 0 && d < 150) {
    e.shootT = e.def.shoot;
    shoot(e.x + e.sw / 2, e.y + e.sh / 2, a, 88, 1, '#ffb0b0');
    sfx('blip');
  }
}

/* --- туман --- */
function fogAI(e, dt, pcx, pcy) {
  var d = dist(e.x, e.y, pcx, pcy);
  if (d < 180) {
    var a = Math.atan2(pcy - e.y, pcx - e.x);
    moveEnemy(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
    if (Math.random() < dt * 6)
      particles.push({ x: e.x + 10 + Math.random() * 6, y: e.y + 10, vx: (Math.random() - 0.5) * 8, vy: -6, t: 0.7, col: '#b9c4d4', s: 1 });
  }
}

/* --- прыгун-сфера --- */
function bounceAI(e, dt, pcx, pcy) {
  var d = dist(e.x, e.y, pcx, pcy);
  if (d < 110) {
    var a = Math.atan2(pcy - e.y, pcx - e.x);
    e.vx += Math.cos(a) * 90 * dt;
    e.vy += Math.sin(a) * 90 * dt;
    var sp = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    if (sp > e.speed) { e.vx = e.vx / sp * e.speed; e.vy = e.vy / sp * e.speed; }
  }
  var before;
  before = { x: e.x, y: e.y };
  var r = moveEnemy(e, e.vx * dt, e.vy * dt);
  if (r && r.hitX) e.vx = -e.vx;
  if (r && r.hitY) e.vy = -e.vy;
}

/* --- машина --- */
function carAI(e, dt) {
  var lim1 = e.min * TILE, lim2 = e.max * TILE;
  e.x += e.speed * e.cdir * dt;
  if (e.x > lim2) { e.x = lim2; e.cdir = -1; }
  if (e.x < lim1) { e.x = lim1; e.cdir = 1; }
}

/* --- БОСС: ФОГ --- */
function fogBossAI(e, dt, pcx, pcy) {
  if (!e.seen) return;
  var d = dist(e.x, e.y, pcx, pcy);
  var a = Math.atan2(pcy - e.y, pcx - e.x);
  if (d > 24) moveEnemy(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
  e.phaseT -= dt;
  if (e.phaseT <= 0) {
    e.phaseT = 2.1;
    ringShot(e.x + 16, e.y + 16, 6, 62, Math.random() * Math.PI, '#b9c4d4');
    sfx('blip');
  }
  e.stT -= dt;
  if (e.stT <= 0) {
    e.stT = 5;
    var minions = 0;
    zone.enemies.forEach(function (m) { if (m.t === 'fog' && !m.dead) minions++; });
    if (minions < 3) spawnEnemy({ t: 'fog', x: Math.floor(e.x / TILE) + 2, y: Math.floor(e.y / TILE) });
  }
}

/* --- БОСС: ЗЛОЙ СОНИК --- */
function evilAI(e, dt, pcx, pcy) {
  if (!e.seen) return;
  e.stT -= dt;
  e.phaseT -= dt;
  var a = Math.atan2(pcy - e.y, pcx - e.x);
  if (e.st === 'idle') {
    moveEnemy(e, Math.cos(a) * e.speed * 0.7 * dt, Math.sin(a) * e.speed * 0.7 * dt);
    if (e.phaseT <= 0 && e.stT <= 0) {
      e.phaseT = 3.4;
      ringShot(e.x + 12, e.y + 12, 8, 78, Math.random() * Math.PI, '#ff5a5a');
      sfx('blip');
    }
    if (e.stT <= -2.4) { e.st = 'tele'; e.stT = 0.5; e.dashA = a; sfx('boss'); }
  } else if (e.st === 'tele') {
    if (Math.random() < 0.3) burst(e.x + 12, e.y + 12, '#ffffff', 2, 30);
    if (e.stT <= 0) { e.st = 'dash'; e.stT = 0.55; }
  } else if (e.st === 'dash') {
    moveEnemy(e, Math.cos(e.dashA) * 185 * dt, Math.sin(e.dashA) * 185 * dt);
    if (Math.random() < dt * 20) particles.push({ x: e.x + 12, y: e.y + 12, vx: 0, vy: 0, t: 0.25, col: '#8fa0c0', s: 1 });
    if (e.stT <= 0) { e.st = 'rest'; e.stT = 0.9; }
  } else {
    if (e.stT <= 0) { e.st = 'idle'; e.stT = 0; }
  }
}

/* --- БОСС: ДРОН-МАСТЕР --- */
function masterAI(e, dt, pcx, pcy) {
  if (!e.seen) return;
  var d = dist(e.x, e.y, pcx, pcy);
  var a = Math.atan2(pcy - e.y, pcx - e.x);
  if (d > 70) moveEnemy(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
  else moveEnemy(e, Math.cos(a + 1.5) * e.speed * 0.6 * dt, Math.sin(a + 1.5) * e.speed * 0.6 * dt);
  /* лип к дому */
  if (dist(e.x, e.y, e.homeX, e.homeY) > 170) {
    var ha = Math.atan2(e.homeY - e.y, e.homeX - e.x);
    moveEnemy(e, Math.cos(ha) * e.speed * dt, Math.sin(ha) * e.speed * dt);
  }
  e.phaseT -= dt;
  if (e.phaseT <= 0) {
    e.phaseT = 1.5;
    for (var k = -1; k <= 1; k++) shoot(e.x + 16, e.y + 16, a + k * 0.26, 92, 1, '#ffb0b0');
    sfx('blip');
  }
  e.stT -= dt;
  if (e.stT <= 0) {
    e.stT = 4.5;
    var minions = 0;
    zone.enemies.forEach(function (m) { if (m.t === 'drone' && !m.dead) minions++; });
    if (minions < 5) spawnEnemy({ t: 'drone', x: Math.floor(e.x / TILE) + (Math.random() < 0.5 ? -2 : 2), y: Math.floor(e.y / TILE) });
  }
}

/* --- БОСС: КОРОЛЕВА СФЕР --- */
function queenAI(e, dt, pcx, pcy) {
  if (!e.seen) return;
  var frac = e.hp / e.maxHp;
  e.phaseT -= dt; e.stT -= dt;
  var a = Math.atan2(pcy - e.y, pcx - e.x);
  if (e.st === 'idle') {
    moveEnemy(e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
    var rate = frac > 0.6 ? 2.4 : (frac > 0.3 ? 1.9 : 1.5);
    if (e.phaseT <= 0) {
      e.phaseT = rate;
      var n = frac > 0.6 ? 10 : (frac > 0.3 ? 12 : 14);
      ringShot(e.x + 16, e.y + 16, n, 70, Math.random() * Math.PI, '#ff5a5a');
      sfx('blip');
    }
    if (frac <= 0.6 && e.stT <= -4) { e.st = 'tele'; e.stT = 0.6; e.dashA = a; sfx('boss'); }
    if (frac <= 0.3) {
      e.sumT = (e.sumT || 0) - dt;
      if (e.sumT <= 0) {
        e.sumT = 3.6;
        var minions = 0;
        zone.enemies.forEach(function (m) { if (m.t === 'sphereling' && !m.dead) minions++; });
        if (minions < 4) spawnEnemy({ t: 'sphereling', x: Math.floor(e.x / TILE) + (Math.random() < 0.5 ? -2 : 2), y: Math.floor(e.y / TILE) });
      }
    }
  } else if (e.st === 'tele') {
    if (Math.random() < 0.4) burst(e.x + 16, e.y + 16, '#ffd76a', 2, 35);
    if (e.stT <= 0) { e.st = 'dash'; e.stT = 0.5; }
  } else if (e.st === 'dash') {
    moveEnemy(e, Math.cos(e.dashA) * 150 * dt, Math.sin(e.dashA) * 150 * dt);
    if (e.stT <= 0) { e.st = 'idle'; e.stT = 0; }
  }
}
