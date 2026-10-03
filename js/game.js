/* ============================================================
   РОМАН: ПИКСЕЛЬНОЕ ПРИКЛЮЧЕНИЕ — game.js
   Ядро: состояние, ввод, звук, сохранения, зоны, игрок
   ============================================================ */
var RP = (typeof window !== 'undefined')
  ? (window.RP = window.RP || {})
  : (globalThis.RP = globalThis.RP || {});

var VW = 320, VH = 180, TILE = 16;
var canvas = null, ctx = null;
var uiCanvas = null, uictx = null;
var state = 'title';       /* title, play, dialog, pause, quests, gameover, fade, ending, credits, controls */
var G = null;              /* игровые данные */
var zone = null;           /* текущая зона (рантайм) */
var player = null;
var remotePlayers = {};    /* кооп: id -> сущность игрока (хост: гости, клиент: чужие) */
var enemyUidSeq = 0;       /* порядковый uid врагов в зоне (совпадает у всех пиров) */
var cam = { x: 0, y: 0 };
var time = 0, shake = 0;
var fade = { a: 0, dir: 0, to: null, sx: 0, sy: 0 };
var banner = { text: '', t: 0 };
var toasts = [];
var particles = [], floats = [], bullets = [];
var dialogState = null;
var toastThrottle = 0;
var titleSel = 0, pauseSel = 0, controlsFrom = 'title';
var ending = { page: 0, phrase: false, spark: [] };
var creditsY = VH;
var saveExists = false;
var SAVE_KEY = 'roman_pixel_adventure_v1';

/* ---------- ввод ---------- */
var held = {}, hit = {};
var preventKeys = { Space: 1, Tab: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };

function initInput() {
  window.addEventListener('keydown', function (e) {
    if (preventKeys[e.code]) e.preventDefault();
    unlockAudio();
    if (!held[e.code]) hit[e.code] = true;
    held[e.code] = true;
  });
  window.addEventListener('keyup', function (e) { held[e.code] = false; });
  window.addEventListener('blur', function () { held = {}; });
}
function anyHit(list) { for (var i = 0; i < list.length; i++) if (hit[list[i]]) return true; return false; }
function anyHeld(list) { for (var i = 0; i < list.length; i++) if (held[list[i]]) return true; return false; }
var K_UP = ['ArrowUp', 'KeyW'], K_DOWN = ['ArrowDown', 'KeyS'], K_LEFT = ['ArrowLeft', 'KeyA'], K_RIGHT = ['ArrowRight', 'KeyD'];
var K_ACT = ['KeyE', 'Enter'], K_ATK = ['Space'], K_USE = ['KeyQ'], K_BIKE = ['ShiftLeft', 'ShiftRight'];
var K_QUEST = ['Tab'], K_PAUSE = ['Escape'], K_GUN = ['KeyF'], K_MUTE = ['KeyM'];

/* ---------- звук ---------- */
var AC = null, master = null, musicOn = true;
var musicTheme = 'title', musicStep = 0, nextNoteT = 0;

function unlockAudio() {
  try {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      AC = new C();
      master = AC.createGain();
      master.gain.value = 0.4;
      master.connect(AC.destination);
    }
    if (AC.state === 'suspended') AC.resume();
  } catch (e) { AC = null; }
}
function tone(f, t0, dur, type, vol) {
  if (!AC || !musicOn) return;
  var o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function sfx(kind) {
  if (!AC || !musicOn) return;
  var t = AC.currentTime;
  switch (kind) {
    case 'blip': tone(660, t, 0.05, 'square', 0.05); break;
    case 'pick': tone(880, t, 0.06, 'square', 0.07); tone(1320, t + 0.06, 0.08, 'square', 0.06); break;
    case 'heart': tone(520, t, 0.08, 'triangle', 0.08); tone(780, t + 0.09, 0.12, 'triangle', 0.07); break;
    case 'attack': tone(300, t, 0.07, 'sawtooth', 0.06); tone(180, t + 0.05, 0.08, 'square', 0.05); break;
    case 'hit': tone(140, t, 0.1, 'sawtooth', 0.08); break;
    case 'hurt': tone(200, t, 0.15, 'square', 0.09); tone(120, t + 0.1, 0.2, 'square', 0.08); break;
    case 'die': tone(330, t, 0.1, 'square', 0.08); tone(220, t + 0.1, 0.1, 'square', 0.08); tone(110, t + 0.2, 0.3, 'sawtooth', 0.08); break;
    case 'boss': tone(90, t, 0.5, 'sawtooth', 0.1); tone(70, t + 0.2, 0.6, 'square', 0.08); break;
    case 'key': [523, 659, 784, 1046].forEach(function (n, i) { tone(midi(n), t + i * 0.09, 0.14, 'square', 0.07); }); break;
    case 'heal': [784, 880, 1046].forEach(function (n, i) { tone(midi(n), t + i * 0.07, 0.1, 'triangle', 0.07); }); break;
    case 'err': tone(160, t, 0.12, 'square', 0.06); break;
    case 'portal': tone(220, t, 0.3, 'sine', 0.09); tone(440, t + 0.15, 0.3, 'sine', 0.08); tone(880, t + 0.3, 0.4, 'sine', 0.07); break;
    case 'shoot': tone(1200, t, 0.05, 'square', 0.05); tone(700, t + 0.04, 0.08, 'square', 0.05); break;
    case 'explosion': tone(80, t, 0.4, 'sawtooth', 0.1); break;
  }
}
function setMusicTheme(name) {
  if (name === musicTheme) return;
  musicTheme = name; musicStep = 0; nextNoteT = AC ? AC.currentTime : 0;
}
function musicTick() {
  if (!AC || !musicOn) return;
  var pat = RP.MUSIC[musicTheme];
  if (!pat) return;
  if (nextNoteT < AC.currentTime) nextNoteT = AC.currentTime + 0.05;
  while (nextNoteT < AC.currentTime + 0.25) {
    var i = musicStep % pat.lead.length;
    var n = pat.lead[i];
    if (n > 0) tone(midi(n), nextNoteT, pat.step * 1.6, 'square', 0.035);
    var b = pat.bass[i];
    if (b > 0) tone(midi(b), nextNoteT, pat.step * 2.2, 'triangle', 0.05);
    nextNoteT += pat.step;
    musicStep++;
  }
}

/* ---------- сохранения ---------- */
function saveGame() {
  if (!G || !zone) return;
  try {
    var collected = {};
    for (var z in RP.ZONES) collected[z] = [];
    var taken = {};
    for (var z2 in RP.ZONES) taken[z2] = [];
    if (zone && zone.spheres) {
      for (var i = 0; i < zone.spheres.length; i++)
        if (zone.spheres[i].taken) collected[zone.id].push(zone.spheres[i].idx);
    }
    if (zone && zone.takenIds) taken[zone.id] = zone.takenIds.slice();
    var prev = readSave();
    if (prev) {
      for (var k in prev.collected) {
        collected[k] = (collected[k] || []).concat(prev.collected[k] || []);
        collected[k] = collected[k].filter(function (v, idx, a) { return a.indexOf(v) === idx; });
      }
      for (var k2 in prev.taken) {
        taken[k2] = (taken[k2] || []).concat(prev.taken[k2] || []);
        taken[k2] = taken[k2].filter(function (v, idx, a) { return a.indexOf(v) === idx; });
      }
    }
    var data = {
      v: 1, zone: zone.id, x: Math.round(player.x), y: Math.round(player.y),
      G: G, collected: collected, taken: taken
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    saveExists = true;
  } catch (e) { }
}
function readSave() {
  try {
    var s = localStorage.getItem(SAVE_KEY);
    if (!s) return null;
    var d = JSON.parse(s);
    if (d && d.v === 1) return d;
  } catch (e) { }
  return null;
}
function newGame() {
  G = {
    flags: {}, spheres: 0, hp: 4, maxHp: 4,
    inv: { goo: 0, photos: 0 },
    items: { bike: false, gun: false },
    keys: { pass: false, key: false },
    ending: false, playtime: 0
  };
  particles = []; floats = []; bullets = []; toasts = [];
  loadZone('home', RP.ZONES.home.spawn.x, RP.ZONES.home.spawn.y);
  state = 'play';
  toast('Новая игра. Поговори с мамой.');
  if (typeof NET !== 'undefined' && NET.flushGuests) NET.flushGuests();
}
function continueGame() {
  var d = readSave();
  if (!d) { newGame(); return; }
  G = d.G;
  if (!G.flags) G.flags = {};
  if (!G.inv) G.inv = { goo: 0, photos: 0 };
  if (!G.items) G.items = { bike: false, gun: false };
  if (!G.keys) G.keys = { pass: false, key: false };
  var zx = d.zone, px = d.x, py = d.y;
  loadZone(zx, Math.floor(px / TILE), Math.floor(py / TILE));
  player.x = px; player.y = py;
  zone.spheres.forEach(function (s) {
    if (d.collected && d.collected[zx] && d.collected[zx].indexOf(s.idx) >= 0) s.taken = true;
  });
  zone.takenIds = (d.taken && d.taken[zx]) ? d.taken[zx].slice() : [];
  zone.items = zone.items.filter(function (it) { return zone.takenIds.indexOf(it.id) < 0; });
  state = 'play';
  toast('Сохранение загружено.');
  if (typeof NET !== 'undefined' && NET.flushGuests) NET.flushGuests();
}
function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
  saveExists = false;
}

/* ---------- утилиты ---------- */
function toast(txt) { toasts.push({ txt: txt, t: 4 }); if (toasts.length > 4) toasts.shift(); sfx('blip'); }
function floatTxt(x, y, txt, col) { floats.push({ x: x, y: y, txt: txt, col: col || '#fff', t: 1 }); }
function burst(x, y, col, n, spd) {
  for (var i = 0; i < (n || 8); i++) {
    var a = Math.random() * Math.PI * 2, v = (spd || 50) * (0.4 + Math.random() * 0.8);
    particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0.4 + Math.random() * 0.3, col: col, s: 1 + (Math.random() < 0.3 ? 1 : 0) });
  }
}
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

/* ---------- зона ---------- */
function tileTypeAt(tx, ty) {
  if (!zone || tx < 0 || ty < 0 || tx >= zone.w || ty >= zone.h) return null;
  return zone.tiles[ty][tx];
}
function gateOpenAt(tx, ty) {
  if (!zone || !zone.def.gates) return false;
  for (var i = 0; i < zone.def.gates.length; i++) {
    var g = zone.def.gates[i];
    if (tx >= g.x && tx < g.x + g.w && ty >= g.y && ty < g.y + g.h)
      return g.open(G);
  }
  return false;
}
function solidPx(px, py) {
  var tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  var t = tileTypeAt(tx, ty);
  if (!t) return true;
  if (t === 'gate') return !gateOpenAt(tx, ty);
  return RP.TILE_INFO[t] ? RP.TILE_INFO[t].solid : false;
}
function boxSolid(x, y, w, h) {
  return solidPx(x, y) || solidPx(x + w - 1, y) || solidPx(x, y + h - 1) || solidPx(x + w - 1, y + h - 1);
}
function moveBox(b, dx, dy) {
  if (dx !== 0) {
    var nx = b.x + dx;
    if (!boxSolid(nx, b.y, b.w, b.h)) b.x = nx;
  }
  if (dy !== 0) {
    var ny = b.y + dy;
    if (!boxSolid(b.x, ny, b.w, b.h)) b.y = ny;
  }
}
function feetBox(e) { return { x: e.x + 4, y: e.y + 9, w: 8, h: 7 }; }

function loadZone(id, sx, sy) {
  var def = RP.ZONES[id];
  if (!def) return;
  var built = def.build();
  var h = built.length, w = built[0].length, y, x;
  var legend = def.legend || {};
  var tiles = [];
  for (y = 0; y < h; y++) {
    if (built[y].length !== w) { /* страховка */ built[y] = (built[y] + '                    ').slice(0, w); }
    var row = [];
    for (x = 0; x < w; x++) {
      var ch = built[y].charAt(x);
      var t = legend[ch] || RP.TILE_CHARS[ch] || 'grass';
      if (!RP.TILE_INFO[t]) t = 'grass';
      row.push(t);
    }
    tiles.push(row);
  }
  var occupied = {};
  function occ(tx, ty) { occupied[ty * w + tx] = true; }
  function carveAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
    occ(tx, ty);
    var t = tiles[ty][tx];
    if (t === 'gate') return;
    if (RP.TILE_INFO[t] && RP.TILE_INFO[t].solid) {
      var c = def.carve || '.';
      var nt = RP.TILE_CHARS[c] && !RP.TILE_INFO[c] ? (legend[c] || RP.TILE_CHARS[c]) : c;
      if (RP.TILE_INFO[nt] && RP.TILE_INFO[nt].solid) nt = 'grass';
      tiles[ty][tx] = nt;
    }
  }
  function walkableAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return false;
    var t = tiles[ty][tx];
    return t === 'gate' || !(RP.TILE_INFO[t] && RP.TILE_INFO[t].solid);
  }
  function carveList(list) {
    list.forEach(function (p) {
      if (p.x >= 0 && p.y >= 0 && p.x < w && p.y < h) carveAt(p.x, p.y);
    });
  }
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function spawnSetFn() {
    var seen = {};
    seen[sy * w + sx] = 1;
    var q = [[sx, sy]];
    for (var i = 0; i < q.length; i++) {
      var c = q[i];
      for (var d = 0; d < 4; d++) {
        var nx = c[0] + DIRS[d][0], ny = c[1] + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var k = ny * w + nx;
        if (seen[k]) continue;
        if (!walkableAt(nx, ny)) continue;
        seen[k] = 1; q.push([nx, ny]);
      }
    }
    return seen;
  }
  function findPath(fx, fy, sset, walkOnly) {
    var seen = {};
    seen[fy * w + fx] = null;
    var q = [[fx, fy]];
    for (var i = 0; i < q.length; i++) {
      var c = q[i];
      if (sset[c[1] * w + c[0]]) {
        var path = [], cur = c;
        while (cur && !(cur[0] === fx && cur[1] === fy)) {
          path.push(cur);
          cur = seen[cur[1] * w + cur[0]];
        }
        path.reverse();
        return path;
      }
      for (var d = 0; d < 4; d++) {
        var nx = c[0] + DIRS[d][0], ny = c[1] + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var k = ny * w + nx;
        if (seen[k] !== undefined) continue;
        if (walkOnly && !walkableAt(nx, ny)) continue;
        seen[k] = c; q.push([nx, ny]);
      }
    }
    return null;
  }
  function ensureReach(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return;
    carveAt(tx, ty); carveAt(tx - 1, ty); carveAt(tx + 1, ty);
    carveAt(tx, ty - 1); carveAt(tx, ty + 1);
    var sset = spawnSetFn();
    if (sset[ty * w + tx]) return;
    var path = findPath(tx, ty, sset, true) || findPath(tx, ty, sset, false);
    if (path) path.forEach(function (c) { carveAt(c[0], c[1]); });
  }
  var defPos = [];
  (def.npcs || []).concat(def.props || []).concat(def.items || []).forEach(function (p) { defPos.push(p); });
  (def.enemies || []).forEach(function (p) { if (!(p.t === 'drone' || p.t === 'droneRed' || p.t === 'car' || p.t === 'carRed' || p.t === 'fog' || p.t === 'fogPurple' || p.t === 'fogBoss' || p.t === 'droneMaster')) defPos.push(p); });
  (def.exits || []).forEach(function (e) {
    for (var ey = e.y; ey < e.y + e.h; ey++)
      for (var ex = e.x; ex < e.x + e.w; ex++) carveAt(ex, ey);
  });
  occ(def.spawn.x, def.spawn.y);
  occ(sx, sy);
  carveAt(sx, sy);
  carveList(defPos);

  /* проходимость: дорожки от спауна до всех важных точек */
  var targets = [];
  (def.items || []).forEach(function (p) { targets.push([p.x, p.y]); });
  (def.npcs || []).forEach(function (p) { targets.push([p.x, p.y]); });
  (def.props || []).forEach(function (p) { targets.push([p.x, p.y]); });
  (def.exits || []).forEach(function (e) {
    for (var ey = e.y; ey < e.y + e.h; ey++)
      for (var ex = e.x; ex < e.x + e.w; ex++) targets.push([ex, ey]);
  });
  targets.forEach(function (t) { ensureReach(t[0], t[1]); });

  /* сферы — детерминированная раскладка по проходимым клеткам */
  var rnd = RP.mulberry32(RP.hashStr(id) + 4242);
  var cand = [];
  for (y = 1; y < h - 1; y++)
    for (x = 1; x < w - 1; x++) {
      if (occupied[y * w + x]) continue;
      var t = tiles[y][x];
      if (RP.TILE_INFO[t] && RP.TILE_INFO[t].solid) continue;
      if (t === 'door' || t === 'gate') continue;
      cand.push(y * w + x);
    }
  for (var i = cand.length - 1; i > 0; i--) {
    var j = (rnd() * (i + 1)) | 0, tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp;
  }
  var spheres = [];
  var count = Math.min(def.spheres || 0, cand.length);
  for (i = 0; i < count; i++) {
    var c = cand[i];
    spheres.push({ x: (c % w) * TILE + 4, y: Math.floor(c / w) * TILE + 4, idx: i, taken: false });
  }

  zone = {
    id: id, def: def, w: w, h: h, tiles: tiles,
    spheres: spheres,
    takenIds: [],
    npcs: (def.npcs || []).map(function (n) { return { id: n.id, x: n.x * TILE, y: n.y * TILE, spr: n.spr, name: n.name, dlg: n.dlg, def: n }; }),
    props: (def.props || []).map(function (p) { return { id: p.id, x: p.x * TILE, y: p.y * TILE, spr: p.spr, name: p.name, dlg: p.dlg, special: p.special, give: p.give, def: p }; }),
    items: (def.items || []).slice(),
    enemies: [],
    drops: [],
    entry: { x: sx, y: sy }
  };
  enemyUidSeq = 0;
  (def.enemies || []).forEach(function (e) { spawnEnemy(e); });

  if (!player) {
    player = { x: 0, y: 0, w: 16, h: 16, dir: 'down', anim: 0, moving: false, iframes: 0, atkT: 0, gunT: 0, buff: 0, riding: false, atkFlash: 0 };
  }
  player.x = sx * TILE; player.y = sy * TILE;
  player.riding = false;
  bullets = [];
  banner = { text: def.name, t: 2.6 };
  setMusicTheme(def.music || 'town');
  updateCam(true);
  if (typeof NET !== 'undefined' && NET.onZoneLoad) NET.onZoneLoad();
}

/* ---------- диалоги ---------- */
function startDialog(lines, onEnd) {
  /* кооп: диалог гостя — не трогаем своё состояние, шлём гостю, cb сохраним */
  if (typeof NET !== 'undefined' && NET.remoteDlg && NET.remoteDlg.conn) {
    NET.sendTo(NET.remoteDlg.conn, { t: 'dlg', l: lines || [] });
    NET.dlgCb[NET.remoteDlg.conn.peer] = onEnd || null;
    return;
  }
  state = 'dialog';
  dialogState = { lines: lines || [], i: 0, chars: 0, onEnd: onEnd || null };
  sfx('blip');
}
function dialogAdvance() {
  if (!dialogState) return;
  var cur = dialogState.lines[dialogState.i];
  if (!cur) { closeDialog(); return; }
  var full = (cur[0] ? cur[1] : cur);
  if (dialogState.chars < full.length) { dialogState.chars = full.length; return; }
  dialogState.i++;
  dialogState.chars = 0;
  sfx('blip');
  if (dialogState.i >= dialogState.lines.length) closeDialog();
}
function closeDialog() {
  var cb = dialogState && dialogState.onEnd;
  dialogState = null;
  state = 'play';
  if (cb) cb();
}
function getLines(key, defName) {
  var fn = RP.DIALOGS[key];
  var lines;
  if (fn) lines = fn(G);
  else lines = [[defName || '?', '...']];
  if (!lines || !lines.length) lines = [[defName || '?', '...']];
  return lines;
}

/* ---------- взаимодействие ---------- */
function nearestInteract(p) {
  p = p || player;
  var pcx = p.x + 8, pcy = p.y + 8;
  var best = null, bd = 24;
  zone.npcs.forEach(function (n) {
    var d = dist(pcx, pcy, n.x + 8, n.y + 8);
    if (d < bd) { bd = d; best = { kind: 'npc', obj: n }; }
  });
  zone.props.forEach(function (p) {
    if (p.taken) return;
    var d = dist(pcx, pcy, p.x + 8, p.y + 8);
    if (d < bd) { bd = d; best = { kind: 'prop', obj: p }; }
  });
  return best;
}
function interact(p) {
  p = p || player;
  var t = nearestInteract(p);
  if (!t) return;
  if (t.kind === 'npc') talkNpc(t.obj);
  else useProp(t.obj);
}
function talkNpc(n) {
  var lines = getLines(n.dlg, n.name);
  startDialog(lines, function () { npcEffect(n); });
}
function npcEffect(n) {
  var f = G.flags;
  if (n.id === 'mama' && !f.fTalkMama) {
    f.fTalkMama = true;
    toast('Квест: собери 10 красных сфер');
  }
  if (n.id === 'sonic' && f.fTalkMama && !f.talkSonic && G.spheres >= 10) {
    f.talkSonic = true;
    toast('Соник: ищи Фога в лесу!');
  }
  if (n.id === 'max' && !f.maxDone && G.inv.goo >= 3) {
    G.inv.goo -= 3; G.spheres += 25; f.maxDone = true;
    toast('+25 сфер! Макс доволен');
    burst(player.x + 8, player.y + 4, '#ffd76a', 14, 60);
    saveGame();
  }
  if (n.id === 'german' && !f.germanDone && G.inv.photos >= 5) {
    G.inv.photos -= 5; G.spheres += 10; G.items.gun = true; f.germanDone = true;
    toast('СФЕРНЫЙ ПИСТОЛЕТ! Кнопка F');
    burst(player.x + 8, player.y + 4, '#7fe0ff', 16, 70);
    saveGame();
  }
  if (n.id === 'leha' && G.spheres >= 20) {
    G.spheres -= 20; G.inv.goo += 4;
    toast('-20 сфер, +4 белой жижи');
    saveGame();
  }
  if (n.id === 'prof' && f.diploma && !f.profDone) {
    f.profDone = true; G.spheres += 20;
    toast('+20 сфер! Диплом принят');
    saveGame();
  }
}
function useProp(p) {
  var f = G.flags;
  /* спец-действия до диалога */
  if (p.special === 'mess') {
    var key = 'mess_' + p.id;
    if (!f[key]) {
      f[key] = true;
      p.taken = true;
      var done = (f.mess_m1 ? 1 : 0) + (f.mess_m2 ? 1 : 0) + (f.mess_m3 ? 1 : 0) + (f.mess_m4 ? 1 : 0);
      startDialog(getLines('mess', p.name), function () {
        if (done >= 4) {
          G.maxHp = Math.min(9, G.maxHp + 1); G.hp = G.maxHp;
          toast('Комната чиста! +1 сердечко');
          burst(player.x + 8, player.y, '#ff6a8a', 18, 70);
          sfx('heal');
        } else toast('Убрано куч: ' + done + '/4');
        saveGame();
      });
      return;
    }
    startDialog([['Рома', 'Чисто. Почти как у людей.']]);
    return;
  }
  if (p.special === 'diploma' && !f.diploma) {
    f.diploma = true;
    startDialog(getLines('diploma', p.name), function () { toast('Диплом найден! Отдай профессору'); saveGame(); });
    return;
  }
  if (p.special === 'forestPortal') {
    if (!f.boss_fog) { startDialog(getLines('portalForest', p.name)); return; }
    if (G.spheres < 50) { startDialog(getLines('portalForest', p.name)); sfx('err'); return; }
    startDialog(getLines('portalForest', p.name), function () {
      G.spheres -= 50; f.fPortal = true;
      sfx('portal');
      toast('Портал активирован! -50 сфер');
      saveGame();
      beginFade('portal', RP.ZONES.portal.spawn.x, RP.ZONES.portal.spawn.y);
    });
    return;
  }
  if (p.special === 'toSonic') {
    startDialog(getLines('portalSonic', p.name), function () {
      beginFade('sonic', RP.ZONES.sonic.spawn.x, RP.ZONES.sonic.spawn.y);
      sfx('portal');
    });
    return;
  }
  if (p.special === 'backPortal') {
    startDialog(getLines('portalBack', p.name), function () {
      beginFade('portal', 24, 17);
      sfx('portal');
    });
    return;
  }
  if (p.special === 'ending') {
    startDialog(getLines('finalMonitor', p.name), function () {
      if (f.boss_queen && !G.ending) beginEnding();
    });
    return;
  }
  if (p.give) {
    if (p.id && zone.takenIds.indexOf(p.id) < 0) {
      zone.takenIds.push(p.id);
      G.inv.goo++;
      toast('+1 белая жижу');
      sfx('pick');
      saveGame();
    }
    startDialog(getLines(p.dlg, p.name));
    return;
  }
  startDialog(getLines(p.dlg, p.name));
}

/* ---------- переходы ---------- */
function beginFade(to, sx, sy) {
  fade = { a: 0, dir: 1, to: to, sx: sx, sy: sy };
  state = 'fade';
}
function beginEnding() {
  G.ending = true;
  ending = { page: 0, phrase: false, spark: [] };
  state = 'ending';
  setMusicTheme('ending');
  saveGame();
  sfx('key');
}

/* ---------- подбор ---------- */
function pickCheck(p) {
  p = p || player;
  var px = p.x + 8, py = p.y + 8;
  for (var i = 0; i < zone.spheres.length; i++) {
    var s = zone.spheres[i];
    if (s.taken) continue;
    if (dist(px, py, s.x + 4, s.y + 4) < 11) {
      s.taken = true; G.spheres++;
      burst(s.x + 4, s.y + 4, '#ff5a5a', 6, 45);
      sfx('pick');
      if (G.spheres % 10 === 0) floatTxt(p.x, p.y - 6, G.spheres + ' сфер!', '#ff8a8a');
    }
  }
  for (i = zone.drops.length - 1; i >= 0; i--) {
    var d = zone.drops[i];
    if (dist(px, py, d.x, d.y) < 11) {
      zone.drops.splice(i, 1);
      G.spheres++;
      burst(d.x, d.y, '#ff5a5a', 6, 45);
      sfx('pick');
    }
  }
  for (i = 0; i < zone.items.length; i++) {
    var it = zone.items[i];
    var ix = it.x * TILE + 8, iy = it.y * TILE + 8;
    if (dist(px, py, ix, iy) < 12) {
      zone.items.splice(i, 1);
      zone.takenIds.push(it.id);
      applyItem(it, ix, iy);
      saveGame();
      break;
    }
  }
}
function applyItem(it, x, y) {
  if (it.t === 'photo') {
    G.inv.photos++;
    toast('Фотик Соника! (' + G.inv.photos + '/5)');
    burst(x, y, '#7fd4ff', 10, 55);
  } else if (it.t === 'goo') {
    G.inv.goo++;
    toast('+1 белая жижу');
    burst(x, y, '#ffffff', 8, 50);
  } else if (it.t === 'bike') {
    G.items.bike = true;
    toast('ВЕЛИК! Кнопка SHIFT — педали');
    burst(x, y, '#ffd76a', 16, 65);
    sfx('key');
  } else if (it.t === 'heart') {
    G.maxHp = Math.min(9, G.maxHp + 1);
    G.hp = Math.min(G.maxHp, G.hp + 1);
    toast('+1 сердечко!');
    burst(x, y, '#ff6a8a', 14, 60);
    sfx('heal');
  }
  sfx('pick');
  floatTxt(x - 6, y - 8, 'ЕСТЬ!', '#fff');
}

/* ---------- урон игроку ---------- */
function hurtPlayer(dmg, srcX, srcY, p) {
  p = p || player;
  if (p.iframes > 0 || state !== 'play') return;
  G.hp -= dmg;
  p.iframes = 1.1;
  shake = 5;
  sfx('hurt');
  burst(p.x + 8, p.y + 8, '#ff4a4a', 10, 60);
  var a = Math.atan2(p.y + 8 - srcY, p.x + 8 - srcX);
  moveBox(p, Math.cos(a) * 6, Math.sin(a) * 6);
  if (G.hp <= 0) {
    G.hp = 0;
    state = 'gameover';
    setMusicTheme('dark');
    sfx('die');
  }
}
function respawn() {
  G.spheres = Math.max(0, G.spheres - 5);
  G.hp = G.maxHp;
  loadZone(zone.id, zone.entry.x, zone.entry.y);
  state = 'play';
  setMusicTheme(zone.def.music || 'town');
  toast('Рома пришёл в себя. Потеряно до 5 сфер.');
}

/* ---------- расходники ---------- */
function useGoo(p) {
  p = p || player;
  if (G.inv.goo <= 0) { toast('Белая жижу закончилась'); sfx('err'); return; }
  G.inv.goo--;
  G.hp = Math.min(G.maxHp, G.hp + 1);
  p.buff = 3.5;
  burst(p.x + 8, p.y + 6, '#ffffff', 12, 55);
  floatTxt(p.x, p.y - 6, 'ЖИЖА!', '#ffffff');
  sfx('heal');
}
function toggleBike(p) {
  p = p || player;
  if (!G.items.bike) { toast('Велика нет. Ищи на свалке.'); sfx('err'); return; }
  p.riding = !p.riding;
  toast(p.riding ? 'Поехали!' : 'Велик убран');
  sfx('blip');
}
function shootGun(p) {
  p = p || player;
  if (!G.items.gun) return;
  if (p.gunT > 0) return;
  if (G.spheres <= 0) { toast('Нет сфер для выстрела'); sfx('err'); return; }
  G.spheres--;
  p.gunT = 0.45;
  var d = p.dir, sp = 175, vx = 0, vy = 0;
  if (d === 'up') vy = -sp; else if (d === 'down') vy = sp;
  else if (d === 'left') vx = -sp; else vx = sp;
  bullets.push({ x: p.x + 8, y: p.y + 8, vx: vx, vy: vy, dmg: 3, friendly: true, life: 1.6, col: '#ff5a5a' });
  sfx('shoot');
}

/* ---------- обновление игрока ---------- */
function stepPlayerTimers(p, dt) {
  p.iframes = Math.max(0, p.iframes - dt);
  p.atkT = Math.max(0, p.atkT - dt);
  p.gunT = Math.max(0, p.gunT - dt);
  p.buff = Math.max(0, p.buff - dt);
  p.atkFlash = Math.max(0, p.atkFlash - dt);
}
function stepMovePlayer(p, dx, dy, dt) {
  p.moving = (dx !== 0 || dy !== 0);
  if (!p.moving) return;
  if (Math.abs(dx) > 0 && Math.abs(dy) > 0) { dx *= 0.707; dy *= 0.707; }
  var speed = p.riding ? 118 : 76;
  if (p.buff > 0) speed *= 1.4;
  var under = tileTypeAt(Math.floor((p.x + 8) / TILE), Math.floor((p.y + 13) / TILE));
  if (under === 'goo') speed *= 0.6;
  if (p.atkT > 0.15) speed *= 0.55;
  moveBox(p, dx * speed * dt, dy * speed * dt);
  p.x = RP.clamp(p.x, 0, zone.w * TILE - 16);
  p.y = RP.clamp(p.y, 0, zone.h * TILE - 16);
  if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left';
  else p.dir = dy > 0 ? 'down' : 'up';
  p.anim += dt * (p.riding ? 12 : 8);
  if (p.riding && Math.random() < dt * 8) {
    particles.push({ x: p.x + 8, y: p.y + 15, vx: 0, vy: -8, t: 0.3, col: '#cfcfcf', s: 1 });
  }
}
function allPlayers() {
  var list = [player];
  for (var id in remotePlayers) list.push(remotePlayers[id]);
  return list;
}
function updatePlayer(dt) {
  stepPlayerTimers(player, dt);

  if (anyHit(K_ACT)) interact(player);
  if (anyHit(K_ATK)) playerAttack(player);
  if (anyHit(K_GUN)) shootGun(player);
  if (anyHit(K_USE)) useGoo(player);
  if (anyHit(K_BIKE)) toggleBike(player);

  var dx = 0, dy = 0;
  if (anyHeld(K_UP)) dy -= 1;
  if (anyHeld(K_DOWN)) dy += 1;
  if (anyHeld(K_LEFT)) dx -= 1;
  if (anyHeld(K_RIGHT)) dx += 1;
  stepMovePlayer(player, dx, dy, dt);
  pickCheck(player);
  checkExits(player);
}
/* кооп-хост: симуляция гостей (команды обрабатывает NET.processCmds) */
function updateRemotes(dt) {
  for (var id in remotePlayers) {
    var rp = remotePlayers[id];
    stepPlayerTimers(rp, dt);
    var dx = (rp.input.r ? 1 : 0) - (rp.input.l ? 1 : 0);
    var dy = (rp.input.d ? 1 : 0) - (rp.input.u ? 1 : 0);
    stepMovePlayer(rp, dx, dy, dt);
    pickCheck(rp);
    checkExits(rp);
  }
}

/* ---------- выходы ---------- */
var exitMsgT = 0;
function checkExits(p) {
  p = p || player;
  var fb = feetBox(p);
  var ex = zone.def.exits || [];
  for (var i = 0; i < ex.length; i++) {
    var e = ex[i];
    var rx = e.x * TILE, ry = e.y * TILE, rw = e.w * TILE, rh = e.h * TILE;
    if (!rectsOverlap(fb.x, fb.y, fb.w, fb.h, rx, ry, rw, rh)) continue;
    if (e.need && !e.need(G)) {
      if (exitMsgT <= 0) { toast(e.msg || 'Закрыто.'); sfx('err'); exitMsgT = 3; }
      continue;
    }
    beginFade(e.to, e.sx, e.sy);
    return;
  }
  /* ворота-гейты */
  var gates = zone.def.gates || [];
  for (i = 0; i < gates.length; i++) {
    var g = gates[i];
    if (!g.open(G) && rectsOverlap(fb.x, fb.y, fb.w, fb.h, g.x * TILE - 4, g.y * TILE - 4, g.w * TILE + 8, g.h * TILE + 8)) {
      if (exitMsgT <= 0) { toast(g.msg || 'Заперто.'); sfx('err'); exitMsgT = 3; }
    }
  }
}

/* ---------- камера ---------- */
function updateCam(snap) {
  var tx = player.x + 8 - VW / 2, ty = player.y + 8 - VH / 2;
  tx = RP.clamp(tx, 0, Math.max(0, zone.w * TILE - VW));
  ty = RP.clamp(ty, 0, Math.max(0, zone.h * TILE - VH));
  if (zone.w * TILE < VW) tx = (zone.w * TILE - VW) / 2;
  if (zone.h * TILE < VH) ty = (zone.h * TILE - VH) / 2;
  if (snap) { cam.x = tx; cam.y = ty; }
  else {
    cam.x += (tx - cam.x) * 0.15;
    cam.y += (ty - cam.y) * 0.15;
  }
}

/* ---------- главный апдейт ---------- */
function updatePlay(dt) {
  G.playtime += dt;
  exitMsgT = Math.max(0, exitMsgT - dt);
  toastThrottle = Math.max(0, toastThrottle - dt);
  updatePlayer(dt);
  updateRemotes(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateParticles(dt);
  checkBossIntros();
  updateCam(false);
  if (anyHit(K_QUEST)) { state = 'quests'; sfx('blip'); }
  else if (anyHit(K_PAUSE)) { state = 'pause'; pauseSel = 0; saveGame(); sfx('blip'); }
  if (anyHit(K_MUTE)) { musicOn = !musicOn; toast(musicOn ? 'Звук вкл' : 'Звук выкл'); }
}
function updateParticles(dt) {
  var i;
  for (i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt;
    if (p.t <= 0) particles.splice(i, 1);
  }
  for (i = floats.length - 1; i >= 0; i--) {
    floats[i].t -= dt; floats[i].y -= 18 * dt;
    if (floats[i].t <= 0) floats.splice(i, 1);
  }
  for (i = toasts.length - 1; i >= 0; i--) {
    toasts[i].t -= dt;
    if (toasts[i].t <= 0) toasts.splice(i, 1);
  }
  if (banner.t > 0) banner.t -= dt;
  shake = Math.max(0, shake - dt * 18);
}
function updateBullets(dt) {
  for (var i = bullets.length - 1; i >= 0; i--) {
    var b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || solidPx(b.x, b.y)) { bullets.splice(i, 1); continue; }
    if (b.friendly) {
      var killed = false;
      for (var j = 0; j < zone.enemies.length; j++) {
        var e = zone.enemies[j];
        if (e.dead) continue;
        if (rectsOverlap(b.x - 3, b.y - 3, 6, 6, e.x + 2, e.y + 2, e.sw - 4, e.sh - 4)) {
          damageEnemy(e, b.dmg, b.x, b.y);
          bullets.splice(i, 1); killed = true;
          break;
        }
      }
      if (killed) continue;
    } else {
      var plist = allPlayers(), hitP = null;
      for (var pi = 0; pi < plist.length; pi++) {
        var pp = plist[pi];
        if (rectsOverlap(b.x - 3, b.y - 3, 6, 6, pp.x + 3, pp.y + 2, 10, 14)) { hitP = pp; break; }
      }
      if (hitP) {
        hurtPlayer(b.dmg, b.x, b.y, hitP);
        bullets.splice(i, 1);
      }
    }
  }
}
function updateDialog(dt) {
  if (!dialogState) { state = 'play'; return; }
  var cur = dialogState.lines[dialogState.i];
  if (!cur) { closeDialog(); return; }
  var full = (cur[0] ? cur[1] : cur);
  dialogState.chars = Math.min(full.length, dialogState.chars + dt * 46);
  if (anyHit(K_ACT) || anyHit(K_ATK)) dialogAdvance();
}
