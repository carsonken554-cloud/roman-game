/* ============================================================
   РОМАН: ПИКСЕЛЬНОЕ ПРИКЛЮЧЕНИЕ — network.js
   Кооп на до 5 игроков: PeerJS (WebRTC), P2P.
   Хост — авторитарен (симулирует мир, врагов, HP, квесты).
   Гость — тонкий клиент: локальный предикшн + снапшоты хоста
   с плавной интерполяцией движения (без рывков/телепортаций).
   ============================================================ */
var RP = (typeof window !== 'undefined')
  ? (window.RP = window.RP || {})
  : (globalThis.RP = globalThis.RP || {});

var NET = {
  mode: 'solo',            /* solo | host | client */
  status: '',              /* '' | connecting | open | error */
  statusText: '',
  code: '',
  peer: null,
  conn: null,              /* client: соединение с хостом */
  conns: {},               /* host: guestId -> conn */
  myId: 0,                 /* client: свой id */
  nextId: 1,
  snapT: 0,
  mvT: 0,
  hiT: 0,
  lastMv: '',
  dlgCb: {},               /* host: guestPeer -> cb отложенного диалога */
  remoteDlg: null,         /* host: сущность гостя, чей диалог активен */
  pendingGuests: [],
  rate: {},                /* host: guestPeer -> {n,t} rate-limit */
  ended: false,
  hardSnap: false,
  overPrev: false,
  watchdogTimer: null,
  keepaliveTimer: null
};

/* Расширенный пул надёжных публичных STUN-серверов (Google, Cloudflare, Mozilla, Twilio) */
var NET_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

var NET_AL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/* ---------- Утилиты передачи данных ---------- */
NET.normCode = function (s) {
  return String(s || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '').slice(0, 6);
};

NET.sendTo = function (conn, obj) {
  if (!conn) return false;
  try {
    if (conn.open === false) return false;
    conn.send(obj);
    return true;
  } catch (e) { return false; }
};

NET.send = function (obj) { return NET.sendTo(NET.conn, obj); };

NET.sendCmd = function (k) {
  if (NET.status === 'open') NET.send({ t: 'cmd', k: k });
};

NET.countGuests = function () {
  var n = 0;
  for (var k in NET.conns) n++;
  return n;
};

NET.updStatus = function () {
  if (NET.mode !== 'host') return;
  var n = NET.countGuests() + 1;
  NET.statusText = n > 1
    ? ('КОМНАТА ' + NET.code + ' · ИГРОКОВ: ' + n)
    : ('КОМНАТА ' + NET.code + ' · ЖДЁМ ДРУЗЕЙ…');
};

NET.fail = function (msg) {
  if (NET.watchdogTimer) { clearTimeout(NET.watchdogTimer); NET.watchdogTimer = null; }
  NET.status = 'error';
  NET.err = msg || 'Ошибка сети';
  NET.statusText = NET.err;
  try { if (NET.peer) NET.peer.destroy(); } catch (e) { }
  try { if (NET.conn && NET.conn.close) NET.conn.close(); } catch (e) { }
};

NET.leave = function () {
  if (NET.watchdogTimer) { clearTimeout(NET.watchdogTimer); NET.watchdogTimer = null; }
  if (NET.keepaliveTimer) { clearInterval(NET.keepaliveTimer); NET.keepaliveTimer = null; }
  try { if (NET.peer) NET.peer.destroy(); } catch (e) { }
  var url = 'index.html';
  if (NET.err) url += '?err=' + encodeURIComponent(NET.err);
  if (typeof location !== 'undefined') location.href = url;
};

/* ---------- Сущность сетевого игрока ---------- */
NET.mkEnt = function (id, name) {
  return {
    id: id, name: name, conn: null,
    x: 0, y: 0, targetX: 0, targetY: 0,
    w: 16, h: 16, dir: 'down', anim: 0, moving: false,
    iframes: 0, atkT: 0, atkFlash: 0, gunT: 0, buff: 0, riding: false,
    input: { u: false, d: false, l: false, r: false },
    cmds: []
  };
};

/* ---------- Запуск из URL-параметров ---------- */
NET.boot = function () {
  if (NET.mode !== 'solo') return;
  try {
    var q = new URLSearchParams(window.location.search);
    var h = q.get('host'), j = q.get('join');
    if (h) NET.startHost(NET.normCode(h));
    else if (j) NET.startClient(NET.normCode(j));
  } catch (e) { }
};

/* Фоновый keepalive для сигнального сервера PeerJS */
NET.setupKeepalive = function () {
  if (NET.keepaliveTimer) return;
  NET.keepaliveTimer = setInterval(function () {
    if (NET.peer && !NET.peer.destroyed) {
      if (NET.peer.disconnected) {
        try { NET.peer.reconnect(); } catch (e) { }
      }
    }
  }, 4000);
};

/* ============================================================
   ЛОГИКА ХОСТА
   ============================================================ */
NET.startHost = function (code) {
  NET.mode = 'host';
  NET.code = code || NET.genCode();
  NET.status = 'connecting';
  NET.statusText = 'СОЗДАНИЕ КОМНАТЫ ' + NET.code + '…';

  /* Хост сразу инициализирует мир игры, чтобы гости не висели в ожидании */
  if (typeof G !== 'undefined' && !G) {
    if (typeof saveExists !== 'undefined' && saveExists && typeof continueGame === 'function') {
      continueGame();
    } else if (typeof newGame === 'function') {
      newGame();
    }
  }

  if (typeof Peer === 'undefined') return NET.fail('PeerJS не загружен (нужен интернет)');
  var peer;
  try {
    peer = new Peer('rpx-' + NET.code, { debug: 0, config: { iceServers: NET_ICE } });
  } catch (e) { return NET.fail('Не удалось создать Peer: ' + e.message); }
  NET.peer = peer;
  NET.setupKeepalive();

  peer.on('open', function () {
    NET.status = 'open';
    NET.updStatus();
    NET.flushGuests();
  });

  peer.on('connection', NET.hostAccept);

  peer.on('error', function (e) {
    var t = e && e.type;
    if (t === 'unavailable-id') NET.fail('Код комнаты занят. Вернитесь в лобби.');
    else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
      NET.fail('Нет связи с сигналингом PeerJS. Проверьте интернет.');
    else if (t !== 'peer-unavailable') NET.fail('Ошибка сети: ' + (t || e));
  });

  peer.on('disconnected', function () {
    try { peer.reconnect(); } catch (e) { }
  });
};

NET.genCode = function () {
  var a = new Uint8Array(6), s = '', i;
  try { crypto.getRandomValues(a); }
  catch (e) { for (i = 0; i < 6; i++) a[i] = (Math.random() * 256) | 0; }
  for (i = 0; i < 6; i++) s += NET_AL[a[i] % NET_AL.length];
  return s;
};

NET.hostAccept = function (conn) {
  NET.rate[conn.peer] = { n: 0, t: 0 };

  conn.on('open', function () {
    if (G && zone) NET.welcome(conn);
    else {
      NET.pendingGuests.push(conn);
      NET.sendTo(conn, { t: 'wait', msg: 'Хост запускает игровой мир…' });
    }
  });

  conn.on('data', function (m) { NET.hostMsg(conn, m); });
  conn.on('close', function () { NET.dropConn(conn); });
  conn.on('error', function () { NET.dropConn(conn); });
};

NET.welcome = function (conn) {
  if (!conn || conn.open === false || conn._gid) return;
  if (!G || !zone) {
    if (NET.pendingGuests.indexOf(conn) < 0) NET.pendingGuests.push(conn);
    NET.sendTo(conn, { t: 'wait', msg: 'Хост запускает игровой мир…' });
    return;
  }
  if (NET.nextId > 4) {
    NET.sendTo(conn, { t: 'bye', why: 'Комната полна (макс. 5 игроков)' });
    try { conn.close(); } catch (e) { }
    return;
  }
  var id = NET.nextId++;
  var name = 'ИГРОК ' + (id + 1);
  var rp = NET.mkEnt(id, name);
  rp.conn = conn;

  var offs = [[18, 0], [-18, 0], [0, 18], [0, -18]];
  var o = offs[(id - 1) % offs.length];
  var nx = player.x + o[0], ny = player.y + o[1];
  if (nx < 0 || ny < 0 || boxSolid(nx, ny, 16, 16)) { nx = player.x; ny = player.y; }
  rp.x = nx; rp.y = ny;
  rp.targetX = nx; rp.targetY = ny;
  rp.dir = player.dir;
  remotePlayers[id] = rp;
  NET.conns[id] = conn;
  conn._gid = id;

  NET.sendTo(conn, { t: 'w', id: id, name: name, s: NET.buildSnap() });
  toast(name + ' подключился!');
  sfx('key');
  NET.updStatus();
};

NET.flushGuests = function () {
  if (NET.mode !== 'host' || !G || !zone) return;
  var list = NET.pendingGuests;
  NET.pendingGuests = [];
  for (var i = 0; i < list.length; i++) NET.welcome(list[i]);
};

NET.dropConn = function (conn) {
  if (!conn) return;
  var gid = conn._gid;
  try { conn.close(); } catch (e) { }
  if (gid) {
    delete NET.conns[gid];
    if (remotePlayers[gid]) delete remotePlayers[gid];
    delete NET.dlgCb[gid];
  }
  if (NET.rate[conn.peer]) delete NET.rate[conn.peer];
  for (var i = NET.pendingGuests.length - 1; i >= 0; i--)
    if (NET.pendingGuests[i] === conn) NET.pendingGuests.splice(i, 1);
  conn._gid = 0;
  if (gid) {
    NET.updStatus();
    if (G) toast('Игрок вышел');
  }
};

NET.hostMsg = function (conn, m) {
  if (!m || typeof m !== 'object') return;
  var r = NET.rate[conn.peer];
  if (r) {
    if (time - r.t >= 1) { r.t = time; r.n = 0; }
    if (++r.n > 160) {
      try { conn.close(); } catch (e) { }
      NET.dropConn(conn);
      return;
    }
  }
  var t = m.t;
  if (t === 'hi') {
    if (conn._gid) return;
    if (G && zone) NET.welcome(conn);
    else {
      if (NET.pendingGuests.indexOf(conn) < 0) NET.pendingGuests.push(conn);
      NET.sendTo(conn, { t: 'wait', msg: 'Хост загружает мир…' });
    }
    return;
  }
  var gid = conn._gid;
  if (!gid) return;
  var rp = remotePlayers[gid];
  if (t === 'mv') {
    if (!rp) return;
    rp.input.u = !!m.u; rp.input.d = !!m.d;
    rp.input.l = !!m.l; rp.input.r = !!m.r;
    if (m.dr === 'up' || m.dr === 'down' || m.dr === 'left' || m.dr === 'right') rp.dir = m.dr;
    return;
  }
  if (t === 'cmd') {
    if (!rp) return;
    var k = m.k;
    if (k === 'act' || k === 'atk' || k === 'gun' || k === 'use' || k === 'bike' || k === 'respawn')
      rp.cmds.push(k);
    return;
  }
  if (t === 'dlgend') {
    var cb = NET.dlgCb[conn.peer];
    NET.dlgCb[conn.peer] = null;
    if (cb) { try { cb(); } catch (e) { if (typeof console !== 'undefined') console.error(e); } }
  }
};

NET.processCmds = function () {
  for (var gid in remotePlayers) {
    var rp = remotePlayers[gid];
    if (!rp.cmds.length) continue;
    var cmds = rp.cmds;
    rp.cmds = [];
    for (var i = 0; i < cmds.length; i++) {
      var k = cmds[i];
      if (k === 'respawn') {
        if (state === 'gameover') respawn();
        continue;
      }
      if (state !== 'play' || !G) continue;
      if (k === 'act') {
        NET.remoteDlg = rp;
        try { interact(rp); } finally { NET.remoteDlg = null; }
      } else if (k === 'atk') playerAttack(rp);
      else if (k === 'gun') shootGun(rp);
      else if (k === 'use') useGoo(rp);
      else if (k === 'bike') toggleBike(rp);
    }
  }
};

NET.buildSnap = function () {
  var ps = [], en = [], dr = [], sp = [], bl = [], tst = [], i, e;
  ps.push({
    i: 0, n: 'РОМАН', x: Math.round(player.x), y: Math.round(player.y),
    d: player.dir, m: player.moving ? 1 : 0, r: player.riding ? 1 : 0,
    a: Math.round((player.atkFlash || 0) * 100) / 100, b: player.buff > 0 ? 1 : 0
  });
  for (var gid in remotePlayers) {
    var rp = remotePlayers[gid];
    ps.push({
      i: rp.id, n: rp.name, x: Math.round(rp.x), y: Math.round(rp.y),
      d: rp.dir, m: rp.moving ? 1 : 0, r: rp.riding ? 1 : 0,
      a: Math.round((rp.atkFlash || 0) * 100) / 100, b: rp.buff > 0 ? 1 : 0
    });
  }
  for (i = 0; i < zone.enemies.length; i++) {
    e = zone.enemies[i];
    if (e.dead) continue;
    en.push({
      u: e.uid, t: e.t, x: Math.round(e.x), y: Math.round(e.y),
      hp: e.hp, st: e.st, an: Math.round(e.anim * 10) / 10,
      fl: Math.round((e.flash || 0) * 100) / 100, s: e.seen ? 1 : 0, c: e.cdir
    });
  }
  for (i = 0; i < zone.drops.length; i++)
    dr.push([Math.round(zone.drops[i].x), Math.round(zone.drops[i].y)]);
  for (i = 0; i < zone.spheres.length; i++)
    if (zone.spheres[i].taken) sp.push(zone.spheres[i].idx);
  for (i = 0; i < bullets.length; i++)
    bl.push([Math.round(bullets[i].x), Math.round(bullets[i].y), bullets[i].friendly ? 1 : 0, bullets[i].col || '#ffd76a']);
  for (i = 0; i < toasts.length; i++) tst.push(toasts[i].txt);
  return {
    t: 's', z: zone.id, ex: zone.entry.x, ey: zone.entry.y,
    ps: ps, en: en, dr: dr, sp: sp, it: zone.takenIds.slice(), b: bl, tst: tst,
    G: G, o: (state === 'gameover' || (G && G.hp <= 0)) ? 1 : 0
  };
};

NET.onZoneLoad = function () {
  if (typeof NET === 'undefined' || NET.mode !== 'host' || !player) return;
  var offs = [[18, 0], [-18, 0], [0, 18], [0, -18]];
  var n = 0;
  for (var gid in remotePlayers) {
    var rp = remotePlayers[gid];
    var o = offs[n % offs.length]; n++;
    var nx = player.x + o[0], ny = player.y + o[1];
    if (nx < 0 || ny < 0 || boxSolid(nx, ny, 16, 16)) { nx = player.x; ny = player.y; }
    rp.x = nx; rp.y = ny;
    rp.targetX = nx; rp.targetY = ny;
    rp.moving = false; rp.riding = false;
    rp.input = { u: false, d: false, l: false, r: false };
  }
};

/* ============================================================
   ЛОГИКА КЛИЕНТА
   ============================================================ */
NET.startClient = function (code) {
  NET.mode = 'client';
  NET.code = code;
  NET.status = 'connecting';
  NET.statusText = 'ПОДКЛЮЧЕНИЕ К КОМНАТЕ ' + code + '…';

  /* Таймер ожидания (watchdog): не зависать бесконечно */
  if (NET.watchdogTimer) clearTimeout(NET.watchdogTimer);
  NET.watchdogTimer = setTimeout(function () {
    if (NET.mode === 'client' && NET.status === 'connecting') {
      NET.fail('Не удалось подключиться к ' + code + '. Проверьте, в игре ли хост, или создайте комнату сами.');
    }
  }, 15000);

  if (typeof Peer === 'undefined') return NET.fail('PeerJS не загружен (нужен интернет)');
  var peer;
  try {
    peer = new Peer({ debug: 0, config: { iceServers: NET_ICE } });
  } catch (e) { return NET.fail('Не удалось создать Peer: ' + e.message); }
  NET.peer = peer;
  NET.setupKeepalive();

  peer.on('open', function () {
    var conn;
    try {
      conn = peer.connect('rpx-' + code, { reliable: true, serialization: 'json' });
    } catch (e) { return NET.fail('Не удалось соединиться: ' + e.message); }
    NET.conn = conn;

    try {
      if (conn.peerConnection) {
        conn.peerConnection.addEventListener('iceconnectionstatechange', function () {
          var ics = conn.peerConnection.iceConnectionState;
          if (ics === 'failed') {
            NET.fail('Прямое P2P-соединение заблокировано сетью одного из игроков (NAT/Firewall).');
          }
        });
      }
    } catch (err) { }

    conn.on('open', function () {
      if (NET.watchdogTimer) { clearTimeout(NET.watchdogTimer); NET.watchdogTimer = null; }
      NET.hiT = 0;
      NET.send({ t: 'hi' });
    });
    conn.on('data', function (m) { NET.clientMsg(m); });
    conn.on('close', function () {
      if (NET.status !== 'error') NET.fail('Хост отключился.');
    });
    conn.on('error', function () {
      if (NET.status !== 'error') NET.fail('Ошибка соединения с хостом.');
    });
  });

  peer.on('error', function (e) {
    if (NET.watchdogTimer) { clearTimeout(NET.watchdogTimer); NET.watchdogTimer = null; }
    var t = e && e.type;
    if (t === 'peer-unavailable') NET.fail('Комната ' + code + ' не найдена.');
    else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
      NET.fail('Нет связи с сигналингом. Проверьте интернет.');
    else NET.fail('Ошибка сети: ' + (t || e));
  });
};

NET.clientMsg = function (m) {
  if (!m || typeof m !== 'object') return;
  var t = m.t;
  if (t === 'w') {
    if (NET.watchdogTimer) { clearTimeout(NET.watchdogTimer); NET.watchdogTimer = null; }
    NET.myId = m.id;
    NET.status = 'open';
    NET.statusText = 'КОМНАТА ' + NET.code;
    NET.applySnap(m.s, true);
  } else if (t === 's') {
    NET.applySnap(m, false);
  } else if (t === 'wait') {
    NET.statusText = m.msg || 'ОЖИДАНИЕ ХОСТА…';
  } else if (t === 'dlg') {
    NET.openGuestDialog(m.l);
  } else if (t === 'bye') {
    NET.fail(m.why || 'Вас исключили из комнаты.');
  }
};

NET.openGuestDialog = function (lines) {
  if (state !== 'play' || dialogState || !lines) {
    NET.send({ t: 'dlgend' });
    return;
  }
  startDialog(lines, function () { NET.send({ t: 'dlgend' }); });
};

/* ---------- Применение снапшота ---------- */
NET.applySnap = function (s, isW) {
  if (!s || !s.G || !s.z) return;
  var prevHp = G ? G.hp : -1;
  var wasOver = NET.overPrev;
  var zoneChanged = !isW && zone && s.z !== zone.id;

  G = s.G;
  if (!G.flags) G.flags = {};
  if (!G.inv) G.inv = { goo: 0, photos: 0 };
  if (!G.items) G.items = { bike: false, gun: false };
  if (!G.keys) G.keys = { pass: false, key: false };

  if (isW || zoneChanged) {
    loadZone(s.z, s.ex, s.ey);
    NET.hardSnap = true;
    if (isW) {
      state = 'play';
      fade = { a: 0, dir: 0, to: null, sx: 0, sy: 0 };
      toasts = [];
      toast('Подключено к комнате ' + NET.code);
    } else {
      dialogState = null;
      fade = { a: 1, dir: -1, to: null, sx: 0, sy: 0 };
      if (state === 'play' || state === 'dialog' || state === 'fade' || state === 'gameover')
        state = 'fade';
    }
  }

  var i;
  for (i = 0; i < zone.spheres.length; i++)
    zone.spheres[i].taken = s.sp.indexOf(zone.spheres[i].idx) >= 0;
  zone.takenIds = s.it.slice();
  zone.items = zone.items.filter(function (it) { return s.it.indexOf(it.id) < 0; });
  zone.drops = [];
  for (i = 0; i < s.dr.length; i++)
    zone.drops.push({ x: s.dr[i][0], y: s.dr[i][1] });

  NET.syncEnemies(s.en);

  bullets = [];
  for (i = 0; i < s.b.length; i++)
    bullets.push({ x: s.b[i][0], y: s.b[i][1], vx: 0, vy: 0, dmg: 1, friendly: !!s.b[i][2], life: 1, col: s.b[i][3] });

  if (s.tst) {
    for (i = 0; i < s.tst.length; i++) {
      var txt = s.tst[i], found = false, j;
      for (j = 0; j < toasts.length; j++)
        if (toasts[j].txt === txt) { toasts[j].t = Math.max(toasts[j].t, 2); found = true; break; }
      if (!found) toasts.push({ txt: txt, t: 3 });
    }
    if (toasts.length > 4) toasts.splice(0, toasts.length - 4);
  }

  var seen = {};
  for (i = 0; i < s.ps.length; i++) {
    var p = s.ps[i];
    if (p.i === NET.myId) {
      seen[p.i] = 1;
      NET.correctSelf(p);
    } else {
      seen[p.i] = 1;
      NET.upsertRemote(p);
    }
  }
  for (var gid in remotePlayers)
    if (!seen[gid] && String(gid) !== String(NET.myId)) delete remotePlayers[gid];

  if (!isW && prevHp >= 0 && G.hp < prevHp && state === 'play') {
    shake = 5;
    sfx('hurt');
    player.iframes = 0.9;
    burst(player.x + 8, player.y + 8, '#ff4a4a', 8, 55);
  }

  var over = !!s.o;
  if (over && !wasOver && (state === 'play' || state === 'dialog' || state === 'fade')) {
    state = 'gameover';
    setMusicTheme('dark');
    NET.hardSnap = true;
  } else if (!over && wasOver && state === 'gameover') {
    state = 'play';
    NET.hardSnap = true;
  }
  NET.overPrev = over;

  if (G.ending && !NET.ended && state !== 'ending' && state !== 'credits') {
    NET.ended = true;
    ending = { page: 0, phrase: false, spark: [] };
    state = 'ending';
    setMusicTheme('ending');
  }
};

NET.correctSelf = function (p) {
  if (!player) return;
  if (NET.hardSnap) {
    player.x = p.x; player.y = p.y;
    NET.hardSnap = false;
  } else {
    var dx = p.x - player.x, dy = p.y - player.y;
    if (Math.abs(dx) > 32 || Math.abs(dy) > 32) {
      player.x = p.x; player.y = p.y;
    } else {
      player.x += dx * 0.25; player.y += dy * 0.25;
    }
  }
  player.riding = !!p.r;
  if (p.b) player.buff = Math.max(player.buff, 1);
  if (p.a > 0) player.atkFlash = Math.max(player.atkFlash, p.a);
};

/* Обновление позиции удалённого игрока (с сохранением целевых координат для lerp) */
NET.upsertRemote = function (p) {
  var rp = remotePlayers[p.i];
  if (!rp) {
    rp = NET.mkEnt(p.i, p.n || ('ИГРОК ' + (p.i + 1)));
    rp.x = p.x;
    rp.y = p.y;
    rp.targetX = p.x;
    rp.targetY = p.y;
    remotePlayers[p.i] = rp;
  }
  rp.targetX = p.x;
  rp.targetY = p.y;

  /* Если смещение слишком большое (телепорт / спавн / вход в зону) — без сглаживания */
  var d = Math.hypot(rp.targetX - rp.x, rp.targetY - rp.y);
  if (d > 48) {
    rp.x = p.x;
    rp.y = p.y;
  }

  rp.dir = p.d;
  rp.moving = !!p.m;
  rp.riding = !!p.r;
  rp.atkFlash = p.a || 0;
  rp.buff = p.b ? Math.max(rp.buff, 1) : rp.buff;
};

NET.syncEnemies = function (list) {
  if (!zone) return;
  var byUid = {}, i;
  for (i = 0; i < zone.enemies.length; i++) byUid[zone.enemies[i].uid] = zone.enemies[i];
  var keep = {};
  for (i = 0; i < list.length; i++) {
    var d = list[i];
    keep[d.u] = 1;
    var e = byUid[d.u];
    if (!e) {
      e = spawnEnemy({ t: d.t, px: d.x, py: d.y, uid: d.u });
      if (!e) continue;
      e.targetX = d.x;
      e.targetY = d.y;
      byUid[d.u] = e;
      if (d.u >= enemyUidSeq) enemyUidSeq = d.u + 1;
    }
    if (e.targetX === undefined) {
      e.x = d.x;
      e.y = d.y;
    }
    e.targetX = d.x;
    e.targetY = d.y;
    if (Math.hypot(e.targetX - e.x, e.targetY - e.y) > 48) {
      e.x = d.x;
      e.y = d.y;
    }
    e.hp = d.hp;
    e.st = d.st;
    e.anim = d.an;
    e.flash = d.fl;
    e.seen = !!d.s;
    if (d.c !== undefined && d.c !== null) e.cdir = d.c;
    e.dead = false;
  }
  for (i = zone.enemies.length - 1; i >= 0; i--)
    if (!keep[zone.enemies[i].uid]) zone.enemies.splice(i, 1);
};

/* ---------- Клиентский игровой тик (предикшн ввода + плавный lerp) ---------- */
NET.updateClient = function (dt) {
  if (!G || !zone || !player) return;
  G.playtime += dt;
  toastThrottle = Math.max(0, toastThrottle - dt);
  stepPlayerTimers(player, dt);

  /* Предикшн движения локального игрока (отклик мгновенный) */
  var dx = 0, dy = 0;
  if (anyHeld(K_UP)) dy -= 1;
  if (anyHeld(K_DOWN)) dy += 1;
  if (anyHeld(K_LEFT)) dx -= 1;
  if (anyHeld(K_RIGHT)) dx += 1;
  stepMovePlayer(player, dx, dy, dt);

  /* Команды хосту */
  if (anyHit(K_ACT)) NET.sendCmd('act');
  if (anyHit(K_ATK)) NET.sendCmd('atk');
  if (anyHit(K_GUN)) NET.sendCmd('gun');
  if (anyHit(K_USE)) NET.sendCmd('use');
  if (anyHit(K_BIKE)) NET.sendCmd('bike');

  /* Локальные UI-клавиши */
  if (anyHit(K_QUEST)) { state = 'quests'; sfx('blip'); }
  else if (anyHit(K_PAUSE)) { state = 'pause'; pauseSel = 0; saveGame(); sfx('blip'); }
  if (anyHit(K_MUTE)) { musicOn = !musicOn; toast(musicOn ? 'Звук вкл' : 'Звук выкл'); }

  /* ПЛАВНАЯ ИНТЕРПОЛЯЦИЯ других игроков (включая хоста) — убирает рывки/телепортации */
  for (var gid in remotePlayers) {
    var rp = remotePlayers[gid];
    if (rp.targetX !== undefined) {
      var rdx = rp.targetX - rp.x;
      var rdy = rp.targetY - rp.y;
      var dist = Math.hypot(rdx, rdy);
      if (dist > 48) {
        rp.x = rp.targetX;
        rp.y = rp.targetY;
      } else if (dist > 0.15) {
        var step = Math.min(1, dt * 20);
        rp.x += rdx * step;
        rp.y += rdy * step;
      } else {
        rp.x = rp.targetX;
        rp.y = rp.targetY;
      }
    }
    var isMoving = rp.moving || (rp.targetX !== undefined && Math.hypot(rp.targetX - rp.x, rp.targetY - rp.y) > 0.3);
    if (isMoving) rp.anim += dt * (rp.riding ? 12 : 8);
    rp.atkFlash = Math.max(0, rp.atkFlash - dt);
  }

  /* Плавная интерполяция врагов */
  if (zone && zone.enemies) {
    for (var ei = 0; ei < zone.enemies.length; ei++) {
      var en = zone.enemies[ei];
      if (en.targetX !== undefined) {
        var edx = en.targetX - en.x, edy = en.targetY - en.y;
        var edist = Math.hypot(edx, edy);
        if (edist > 48) {
          en.x = en.targetX; en.y = en.targetY;
        } else if (edist > 0.15) {
          var estep = Math.min(1, dt * 18);
          en.x += edx * estep;
          en.y += edy * estep;
        } else {
          en.x = en.targetX; en.y = en.targetY;
        }
      }
    }
  }

  updateParticles(dt);
  updateCam(false);
};

/* ---------- Главный сетевой тик ---------- */
NET.tick = function (dt) {
  if (NET.mode === 'solo') return;

  if (NET.mode === 'host') {
    NET.processCmds();
    if (!G || !zone || NET.status !== 'open') return;
    NET.snapT -= dt;
    if (NET.snapT <= 0) {
      NET.snapT = 1 / 20; /* 20 Гц: частое и плавное обновление снапшотов */
      var snap = NET.buildSnap();
      for (var id in NET.conns) NET.sendTo(NET.conns[id], snap);
    }
    return;
  }

  if (NET.status === 'connecting') {
    NET.hiT -= dt;
    if (NET.hiT <= 0) {
      NET.hiT = 1.5;
      NET.send({ t: 'hi' });
    }
    return;
  }
  if (NET.status !== 'open' || !player) return;

  /* Передача ввода хосту (при изменении + каждые 100 мс при удержании) */
  var u = anyHeld(K_UP), d = anyHeld(K_DOWN), l = anyHeld(K_LEFT), r = anyHeld(K_RIGHT);
  var sig = (u ? 1 : 0) + '' + (d ? 1 : 0) + (l ? 1 : 0) + (r ? 1 : 0) + player.dir;
  NET.mvT -= dt;
  if (sig !== NET.lastMv || NET.mvT <= 0) {
    NET.lastMv = sig;
    NET.mvT = 0.1;
    NET.send({ t: 'mv', u: u, d: d, l: l, r: r, dr: player.dir });
  }
};
