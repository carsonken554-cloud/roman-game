/* ============================================================
   РОМАН: ПИКСЕЛЬНОЕ ПРИКЛЮЧЕНИЕ — render.js
   Отрисовка мира, интерфейса, меню
   ============================================================ */
var RP = (typeof window !== 'undefined')
  ? (window.RP = window.RP || {})
  : (globalThis.RP = globalThis.RP || {});

var lightCvs = null;

/* текст рисуется на гладком UI-слое (ui-канвас, масштаб без pixelated),
   координаты — в игровых единицах; UIPX — множитель разрешения слоя */
var UIPX = 3;

function text(str, x, y, col, align, font) {
  var g = uictx || ctx;
  g.font = (font || '8px monospace').replace(/monospace/g, 'Consolas, monospace');
  g.fillStyle = col || '#ffffff';
  g.textAlign = align || 'left';
  g.textBaseline = 'top';
  g.fillText(str, x, y);
}
function textShadow(str, x, y, col, align, font) {
  text(str, x + 1, y + 1, 'rgba(0,0,0,0.8)', align, font);
  text(str, x, y, col, align, font);
}
function panel(x, y, w, h, fill) {
  ctx.fillStyle = fill || 'rgba(8,8,16,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#5d6677';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = '#2a2e38';
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}
function wrapText(str, max) {
  var words = String(str).split(' '), lines = [], cur = '';
  for (var i = 0; i < words.length; i++) {
    var t = cur ? cur + ' ' + words[i] : words[i];
    if (t.length > max && cur) { lines.push(cur); cur = words[i]; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ---------- мир ---------- */
function renderWorld() {
  var i, j;
  var x0 = Math.max(0, Math.floor(cam.x / TILE));
  var y0 = Math.max(0, Math.floor(cam.y / TILE));
  var x1 = Math.min(zone.w - 1, Math.floor((cam.x + VW) / TILE));
  var y1 = Math.min(zone.h - 1, Math.floor((cam.y + VH) / TILE));
  var h = RP.hashStr;
  for (var ty = y0; ty <= y1; ty++) {
    for (var tx = x0; tx <= x1; tx++) {
      var t = zone.tiles[ty][tx];
      var frames = RP.TILES[t];
      if (!frames) continue;
      if (t === 'gate' && gateOpenAt(tx, ty)) frames = RP.TILES.metalFloor;
      var v = (h(zone.id) + tx * 73856093 + ty * 19349663) % frames.length;
      if (v < 0) v += frames.length;
      ctx.drawImage(frames[v], tx * TILE - cam.x, ty * TILE - cam.y);
    }
  }
  /* порталы — свечение */
  zone.props.forEach(function (p) {
    if (!p.taken && (p.special === 'forestPortal' || p.special === 'toSonic' || p.special === 'backPortal')) {
      var active = p.special === 'forestPortal' ? (G.flags.boss_fog) : true;
      if (!active) return;
      var gx = p.x + 8 - cam.x, gy = p.y + 8 - cam.y;
      var r = 14 + Math.sin(time * 3) * 3;
      var gr = ctx.createRadialGradient(gx, gy, 2, gx, gy, r);
      gr.addColorStop(0, 'rgba(200,120,255,' + (0.5 + Math.sin(time * 4) * 0.15) + ')');
      gr.addColorStop(1, 'rgba(160,60,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
  });
  /* сферы */
  for (i = 0; i < zone.spheres.length; i++) {
    var s = zone.spheres[i];
    if (s.taken) continue;
    var bob = Math.sin(time * 4 + i) * 1.5;
    ctx.drawImage(RP.SPR.sphere[(Math.floor(time * 6) + i) % 2], Math.round(s.x - cam.x), Math.round(s.y - cam.y + bob));
  }
  for (i = 0; i < zone.drops.length; i++) {
    var d = zone.drops[i];
    ctx.drawImage(RP.SPR.sphere[(Math.floor(time * 6) + i) % 2], Math.round(d.x - 4 - cam.x), Math.round(d.y - 4 - cam.y + Math.sin(time * 5 + i) * 1.5));
  }
  /* предметы */
  for (i = 0; i < zone.items.length; i++) {
    var it = zone.items[i];
    var img = it.t === 'photo' ? RP.SPR.photo : it.t === 'goo' ? RP.SPR.goo : it.t === 'bike' ? RP.SPR.bike : RP.SPR.heart;
    var ix = Math.round(it.x * TILE + 8 - img.width / 2 - cam.x);
    var iy = Math.round(it.y * TILE + 14 - img.height - cam.y + Math.sin(time * 3 + i) * 1.5);
    ctx.drawImage(img, ix, iy);
    if (it.t === 'photo' && Math.floor(time * 4 + i) % 4 === 0) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(ix + img.width, iy, 1, 1);
    }
  }
  /* сортировка по Y */
  var ents = [];
  zone.props.forEach(function (p) { if (!p.taken) ents.push({ y: p.y + 16, kind: 'prop', o: p }); });
  zone.npcs.forEach(function (n) { ents.push({ y: n.y + 16, kind: 'npc', o: n }); });
  zone.enemies.forEach(function (e) { if (!e.dead) ents.push({ y: e.y + e.sh, kind: 'enemy', o: e }); });
  for (var rid in remotePlayers) ents.push({ y: remotePlayers[rid].y + 16, kind: 'rp', o: remotePlayers[rid] });
  ents.push({ y: player.y + 16, kind: 'player', o: player });
  ents.sort(function (a, b) { return a.y - b.y; });

  for (i = 0; i < ents.length; i++) {
    var en = ents[i];
    if (en.kind === 'prop') drawProp(en.o);
    else if (en.kind === 'npc') drawNpc(en.o);
    else if (en.kind === 'enemy') drawEnemy(en.o);
    else if (en.kind === 'rp') { drawPlayerEnt(en.o); drawNameTag(en.o); }
    else drawPlayer();
  }
  /* снаряды */
  for (i = 0; i < bullets.length; i++) {
    var b = bullets[i];
    ctx.fillStyle = b.col || '#ffd76a';
    ctx.fillRect(Math.round(b.x - 2 - cam.x), Math.round(b.y - 2 - cam.y), 4, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(b.x - 1 - cam.x), Math.round(b.y - 1 - cam.y), 2, 2);
  }
  /* эффекты */
  for (i = 0; i < particles.length; i++) {
    var p = particles[i];
    ctx.globalAlpha = Math.max(0, Math.min(1, p.t * 3));
    ctx.fillStyle = p.col;
    ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.s, p.s);
  }
  ctx.globalAlpha = 1;
  /* всплывающий текст */
  for (i = 0; i < floats.length; i++) {
    var f = floats[i];
    ctx.globalAlpha = Math.max(0, Math.min(1, f.t * 2));
    textShadow(f.txt, Math.round(f.x - cam.x), Math.round(f.y - cam.y), f.col, 'left');
  }
  ctx.globalAlpha = 1;
  /* темнота / тинт */
  var def = zone.def;
  if (def.dark > 0) {
    if (!lightCvs) lightCvs = RP.makeCanvas(VW, VH);
    var lg = lightCvs.getContext('2d');
    lg.globalCompositeOperation = 'source-over';
    lg.clearRect(0, 0, VW, VH);
    lg.fillStyle = 'rgba(4,4,12,' + def.dark + ')';
    lg.fillRect(0, 0, VW, VH);
    lg.globalCompositeOperation = 'destination-out';
    var px = player.x + 8 - cam.x, py = player.y + 8 - cam.y;
    var gr2 = lg.createRadialGradient(px, py, 24, px, py, 84);
    gr2.addColorStop(0, 'rgba(0,0,0,1)');
    gr2.addColorStop(1, 'rgba(0,0,0,0)');
    lg.fillStyle = gr2;
    lg.fillRect(0, 0, VW, VH);
    lg.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCvs, 0, 0);
  }
  if (def.tint) {
    ctx.fillStyle = def.tint;
    ctx.fillRect(0, 0, VW, VH);
  }
}

function drawProp(p) {
  var img = RP.SPR.props[p.spr] || RP.SPR.props.capsule;
  var dx = Math.round(p.x + 8 - img.width / 2 - cam.x);
  var dy = Math.round(p.y + 16 - img.height - cam.y);
  ctx.drawImage(img, dx, dy);
}
function npcFace(n) {
  var dx = player.x - n.x, dy = player.y - n.y;
  if (Math.abs(dx) + Math.abs(dy) > 60) return { dir: 'down', flip: false };
  if (Math.abs(dx) > Math.abs(dy)) return { dir: 'side', flip: dx < 0 };
  return { dir: dy > 0 ? 'down' : 'up', flip: false };
}
function drawNpc(n) {
  var spr = RP.SPR[n.spr];
  if (!spr) return;
  var face = npcFace(n);
  var frame = spr[face.dir][0];
  var dx = Math.round(n.x - cam.x), dy = Math.round(n.y - cam.y);
  if (face.flip) {
    ctx.save();
    ctx.translate(dx + 16, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(frame, 0, 0);
    ctx.restore();
  } else ctx.drawImage(frame, dx, dy);
}
function drawPlayerEnt(p) {
  var spr = RP.SPR.player;
  var d = p.dir;
  var key = (d === 'left' || d === 'right') ? 'side' : d;
  var fi = p.moving ? (Math.floor(p.anim) % 2) : 0;
  var frame = spr[key][fi];
  var dx = Math.round(p.x - cam.x), dy = Math.round(p.y - cam.y);
  if (p.riding) {
    ctx.drawImage(RP.SPR.bike, dx, dy + 6);
  }
  var blink = p.iframes > 0 && Math.floor(time * 20) % 2 === 0;
  if (blink) ctx.globalAlpha = 0.35;
  if (d === 'left') {
    ctx.save();
    ctx.translate(dx + 16, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(frame, 0, 0);
    ctx.restore();
  } else ctx.drawImage(frame, dx, dy);
  ctx.globalAlpha = 1;
  /* удар */
  if (p.atkFlash > 0) {
    ctx.fillStyle = 'rgba(255,235,160,0.9)';
    if (d === 'down') ctx.fillRect(dx - 6, dy + 12, 28, 6);
    else if (d === 'up') ctx.fillRect(dx - 6, dy - 6, 28, 6);
    else if (d === 'left') ctx.fillRect(dx - 12, dy + 4, 14, 8);
    else ctx.fillRect(dx + 12, dy + 4, 14, 8);
    ctx.fillStyle = '#ffffff';
    if (d === 'down') ctx.fillRect(dx - 2, dy + 14, 20, 2);
    else if (d === 'up') ctx.fillRect(dx - 2, dy - 4, 20, 2);
    else if (d === 'left') ctx.fillRect(dx - 10, dy + 6, 8, 3);
    else ctx.fillRect(dx + 16, dy + 6, 8, 3);
  }
}
function drawPlayer() { drawPlayerEnt(player); }
function drawNameTag(p) {
  if (!p.name) return;
  textShadow(p.name, Math.round(p.x + 8 - cam.x), Math.round(p.y - cam.y - 4),
    '#7fe0a0', 'center', '7px monospace');
}
function drawEnemy(e) {
  var frames = e.frames;
  var img;
  if (frames instanceof Array) img = frames[Math.floor(e.anim) % frames.length];
  else img = frames;
  if (!img) return;
  var dx = Math.round(e.x - cam.x), dy = Math.round(e.y - cam.y);
  if (e.t === 'car' || e.t === 'carRed') {
    if (e.cdir < 0) {
      ctx.save();
      ctx.translate(dx + img.width, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    } else ctx.drawImage(img, dx, dy);
  } else if (e.flash > 0) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(img, dx, dy - 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(dx, dy, img.width, img.height);
  } else {
    ctx.drawImage(img, dx, dy);
  }
  if (e.boss && e.seen && Math.floor(time * 6) % 2 === 0 && e.st === 'tele') {
    ctx.strokeStyle = '#ff5a5a';
    ctx.strokeRect(dx + 0.5, dy + 0.5, img.width - 1, img.height - 1);
  }
}

/* ---------- HUD ---------- */
function renderHUD() {
  var i;
  for (i = 0; i < G.maxHp; i++) {
    var hx = 4 + i * 11;
    if (i < G.hp) ctx.drawImage(RP.SPR.heart, hx, 4);
    else { ctx.globalAlpha = 0.25; ctx.drawImage(RP.SPR.heart, hx, 4); ctx.globalAlpha = 1; }
  }
  ctx.drawImage(RP.SPR.sphere[0], 5, 15);
  textShadow('x' + G.spheres, 16, 14, '#ffd0d0');
  ctx.drawImage(RP.SPR.goo, 4, 24);
  textShadow('x' + G.inv.goo + '  [Q]', 16, 26, '#dfe4ea');
  /* ключи и приобретения */
  var kx = 4, ky = 38;
  if (G.keys.pass) { ctx.drawImage(RP.SPR.pass, kx, ky); kx += 13; }
  if (G.keys.key) { ctx.drawImage(RP.SPR.key, kx, ky); kx += 13; }
  if (G.items.gun) { ctx.drawImage(RP.SPR.gun, kx, ky); kx += 13; }
  if (G.items.bike) { ctx.drawImage(RP.SPR.bike, kx, ky); kx += 17; }
  if (G.inv.photos > 0) { ctx.drawImage(RP.SPR.photo, kx, ky + 1); textShadow('' + G.inv.photos, kx + 11, ky + 1, '#bfe6ff'); }
  /* цель */
  var obj = RP.objective(G);
  var ol = wrapText(obj, 34);
  for (i = 0; i < ol.length && i < 2; i++)
    textShadow(ol[i], VW - 4, 4 + i * 9, i === 0 ? '#ffe9a0' : '#ffd0d0', 'right');
  textShadow('ЦЕЛЬ', VW - 4, 4 + ol.length * 9 + 1, '#8a8f98', 'right', '7px monospace');
  /* босс */
  var boss = activeBoss();
  if (boss) {
    var bw = 170, bx = (VW - bw) / 2, by = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 9);
    ctx.fillStyle = '#3a1015';
    ctx.fillRect(bx, by, bw, 7);
    ctx.fillStyle = '#e13a3a';
    ctx.fillRect(bx, by, Math.max(0, bw * boss.hp / boss.maxHp), 7);
    ctx.fillStyle = '#ff9d9d';
    ctx.fillRect(bx, by, Math.max(0, bw * boss.hp / boss.maxHp), 2);
    var names = { fog: 'ФОГ', evil: 'ЗЛОЙ СОНИК', drone: 'ДРОН-МАСТЕР', queen: 'КОРОЛЕВА СФЕР' };
    textShadow(names[boss.boss] || 'БОСС', VW / 2, by + 10, '#ffcece', 'center', '7px monospace');
  }
  /* подсказка взаимодействия */
  if (state === 'play') {
    var t = nearestInteract();
    if (t) {
      var o = t.obj;
      var sx = Math.round(o.x + 8 - cam.x), sy = Math.round(o.y - cam.y - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(sx - 7, sy - 9, 14, 11);
      ctx.strokeStyle = '#ffe9a0';
      ctx.strokeRect(sx - 6.5, sy - 8.5, 13, 10);
      text('E', sx, sy - 8, '#ffe9a0', 'center');
      var label = o.name || '';
      if (label) textShadow(label, sx, sy - 20, '#ffffff', 'center', '7px monospace');
    }
  }
  /* индикатор коопа */
  if (typeof NET !== 'undefined' && NET.mode !== 'solo') {
    var lbl = NET.mode === 'host'
      ? ('КОМНАТА ' + NET.code + ' · ' + (NET.countGuests() + 1) + ' ИГР. [КЛИК: ССЫЛКА]')
      : ('КОМНАТА ' + NET.code + ' · ГОСТЬ' + (NET.conn && NET.conn.transport === 'mqtt' ? ' · РЕЗЕРВНЫЙ КАНАЛ' : ''));
    textShadow(lbl, 4, VH - 6, '#7fe0a0', 'left', '7px monospace');
  }
}

/* ---------- диалог ---------- */
function renderDialog() {
  if (!dialogState) return;
  var cur = dialogState.lines[dialogState.i];
  if (!cur) return;
  var speaker = cur[0] || '', body = cur[1] || '';
  var shown = body.slice(0, Math.floor(dialogState.chars));
  var lines = wrapText(shown, 54);
  var bx = 6, by = 140, bw = VW - 12, bh = 36;
  panel(bx, by, bw, bh);
  var spCol = speaker === 'Рома' ? '#8fd0ff' : (speaker.indexOf('Соник') >= 0 || speaker === 'ЗЛОЙ СОНИК' ? '#c9d2e0' : '#ffe9a0');
  textShadow(speaker, bx + 6, by + 3, spCol, 'left', 'bold 8px monospace');
  if (Math.floor(time * 3) % 2 === 0) text('▼', bx + bw - 8, by + 3, '#8a8f98');
  for (var i = 0; i < lines.length && i < 3; i++)
    text(lines[i], bx + 6, by + 13 + i * 8, '#f0f0f2');
}

/* ---------- журнал квестов ---------- */
function renderQuestLog() {
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, VW, VH);
  panel(16, 10, VW - 32, VH - 20);
  textShadow('ЖУРНАЛ — ' + zone.def.name, VW / 2, 16, '#ffe9a0', 'center', 'bold 9px monospace');
  var qs = RP.questLog(G);
  var y = 30;
  for (var i = 0; i < qs.length && y < VH - 52; i++) {
    var q = qs[i];
    text(q.done ? '[x]' : '[ ]', 24, y, q.done ? '#6fe07a' : '#ffd76a');
    text(q.title, 44, y, q.done ? '#8a8f98' : '#ffffff');
    if (!q.done && i < 6) text(q.hint, 44, y + 8, '#9aa0ab', 'left', '7px monospace');
    y += q.done ? 11 : 18;
  }
  var mins = Math.floor(G.playtime / 60), secs = Math.floor(G.playtime % 60);
  text('Сферы: ' + G.spheres + '   Фотики: ' + G.inv.photos + '/5   Жижу: ' + G.inv.goo +
    '   Время: ' + mins + ':' + (secs < 10 ? '0' : '') + secs,
    VW / 2, VH - 30, '#b9c4d4', 'center', '7px monospace');
  text('TAB — закрыть', VW / 2, VH - 20, '#8a8f98', 'center', '7px monospace');
}

/* ---------- пауза ---------- */
var PAUSE_ITEMS = ['ПРОДОЛЖИТЬ', 'СОХРАНИТЬ', 'УПРАВЛЕНИЕ', 'В ГЛАВНОЕ МЕНЮ'];
function renderPause() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, VW, VH);
  panel(80, 40, 160, 106);
  textShadow('ПАУЗА', VW / 2, 48, '#ffe9a0', 'center', 'bold 12px monospace');
  for (var i = 0; i < PAUSE_ITEMS.length; i++) {
    var sel = i === pauseSel;
    text((sel ? '> ' : '  ') + PAUSE_ITEMS[i], VW / 2, 72 + i * 14, sel ? '#ffd76a' : '#c9cdd4', 'center');
  }
  text('ESC — продолжить', VW / 2, 134, '#8a8f98', 'center', '7px monospace');
}

/* ---------- заголовок ---------- */
function renderTitle() {
  var g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, '#101026');
  g.addColorStop(0.6, '#1a1436');
  g.addColorStop(1, '#241a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  /* звёзды */
  for (var i = 0; i < 40; i++) {
    var sx = (RP.hashStr('st' + i) % VW), sy = (RP.hashStr('sy' + i) % 100);
    ctx.fillStyle = Math.floor(time * 3 + i) % 5 === 0 ? '#ffffff' : '#7d84a8';
    ctx.fillRect(sx, sy, 1, 1);
  }
  /* летающие сферы */
  for (i = 0; i < 8; i++) {
    var fx = (RP.hashStr('fx' + i) * 3.1 + time * (10 + i * 3)) % (VW + 20) - 10;
    var fy = 30 + (RP.hashStr('fy' + i) % 130) + Math.sin(time * 2 + i) * 6;
    ctx.drawImage(RP.SPR.sphere[i % 2], Math.round(fx), Math.round(fy));
  }
  /* земля */
  ctx.fillStyle = '#2b7a3a';
  ctx.fillRect(0, 156, VW, 24);
  ctx.fillStyle = '#1e5c2c';
  ctx.fillRect(0, 156, VW, 3);
  /* бегущий Рома */
  var px = ((time * 46) % (VW + 40)) - 20;
  var spr = RP.SPR.player;
  ctx.drawImage(spr.side[Math.floor(time * 8) % 2], Math.round(px), 140);
  ctx.drawImage(RP.SPR.sphere[0], Math.round(px + 22), 148);

  textShadow('РОМАН', VW / 2 + 2, 26, 'rgba(0,0,0,0.7)', 'center', 'bold 34px monospace');
  textShadow('РОМАН', VW / 2, 24, '#ff4a4a', 'center', 'bold 34px monospace');
  textShadow('ПИКСЕЛЬНОЕ ПРИКЛЮЧЕНИЕ', VW / 2, 62, '#ffe9a0', 'center', 'bold 10px monospace');
  if (G && G.ending) textShadow('✓ ИГРА ПРОЙДЕНА', VW / 2, 76, '#6fe07a', 'center', '7px monospace');

  var items = ['НОВАЯ ИГРА', 'ПРОДОЛЖИТЬ', 'УПРАВЛЕНИЕ'];
  for (i = 0; i < items.length; i++) {
    var sel = i === titleSel;
    var dis = i === 1 && !saveExists;
    text((sel ? '> ' : '  ') + items[i], VW / 2, 96 + i * 15, dis ? '#565b64' : (sel ? '#ffd76a' : '#c9cdd4'), 'center');
  }
  /* статус мультиплеера */
  if (typeof NET !== 'undefined' && NET.mode !== 'solo') {
    if (NET.status === 'error') {
      textShadow(NET.statusText || 'Ошибка сети', VW / 2, 146, '#ff6a6a', 'center', '7px monospace');
      if (Math.floor(time * 2) % 2 === 0)
        text('ENTER / ESC — в лобби', VW / 2, 156, '#ffe9a0', 'center', '7px monospace');
    } else {
      var dot = '.'.repeat ? '.'.repeat((Math.floor(time * 2) % 3) + 1) : '...';
      var stxt = NET.statusText || '';
      textShadow(stxt + (NET.status === 'open' ? '' : dot), VW / 2, 146, '#7fe0a0', 'center', '7px monospace');
      text('ESC — отмена и возврат в лобби', VW / 2, 156, 'rgba(255,255,255,0.45)', 'center', '7px monospace');
    }
  }
  text('E / ENTER — выбрать · стрелки — меню · M — звук', VW / 2, 168, 'rgba(255,255,255,0.45)', 'center', '7px monospace');
}

/* ---------- управление ---------- */
function renderControls() {
  ctx.fillStyle = '#0c0c18';
  ctx.fillRect(0, 0, VW, VH);
  panel(24, 12, VW - 48, VH - 24);
  textShadow('УПРАВЛЕНИЕ', VW / 2, 20, '#ffe9a0', 'center', 'bold 11px monospace');
  var rows = [
    ['WASD / стрелки', 'ходьба'],
    ['E', 'говорить, осмотреть'],
    ['ПРОБЕЛ', 'удар'],
    ['F', 'сферомёт (−1 сфера)'],
    ['Q', 'выпить белую жижу'],
    ['SHIFT', 'велик (вкл/выкл)'],
    ['TAB', 'журнал квестов'],
    ['ESC', 'пауза и сохранение'],
    ['M', 'звук вкл/выкл']
  ];
  for (var i = 0; i < rows.length; i++) {
    text(rows[i][0], 44, 40 + i * 13, '#ffd76a', 'left', 'bold 8px monospace');
    text('— ' + rows[i][1], 160, 40 + i * 13, '#c9cdd4');
  }
  text('Собирай красные сферы. Сфера — ресурс, валюта и смысл.', VW / 2, 162, '#8a8f98', 'center', '7px monospace');
  text('E / ESC — назад', VW / 2, VH - 20, '#ffe9a0', 'center', '7px monospace');
}

/* ---------- game over ---------- */
function renderGameOver() {
  ctx.fillStyle = 'rgba(40,0,10,0.75)';
  ctx.fillRect(0, 0, VW, VH);
  textShadow('РОМА ПАЛ', VW / 2, 60, '#ff4a4a', 'center', 'bold 22px monospace');
  text('Но сферы бессмертны, как и ты.', VW / 2, 94, '#f0d0d0', 'center');
  text('Потеряно до 5 сфер.', VW / 2, 108, '#c9a0a0', 'center', '7px monospace');
  if (Math.floor(time * 2) % 2 === 0)
    text('E — подняться', VW / 2, 134, '#ffe9a0', 'center');
}

/* ---------- финал ---------- */
function renderEnding() {
  ctx.fillStyle = '#05050c';
  ctx.fillRect(0, 0, VW, VH);
  if (state === 'credits') {
    var y = creditsY;
    for (var i = 0; i < RP.CREDITS.length; i++) {
      var line = RP.CREDITS[i];
      if (y > -10 && y < VH + 10)
        textShadow(line, VW / 2, y, i === 0 ? '#ff4a4a' : '#e8e8f0', 'center', i === 0 ? 'bold 10px monospace' : '8px monospace');
      y += 13;
    }
    if (creditsY + RP.CREDITS.length * 13 < 30 && Math.floor(time * 2) % 2 === 0)
      text('E — в главное меню', VW / 2, VH - 18, '#ffe9a0', 'center', '7px monospace');
    return;
  }
  if (!ending.phrase) {
    var page = RP.STORY[ending.page];
    if (!page) { state = 'credits'; creditsY = VH + 10; return; }
    var lines = wrapText(page[0], 50);
    var startY = Math.round(VH / 2 - lines.length * 5);
    for (var j = 0; j < lines.length; j++)
      textShadow(lines[j], VW / 2, startY + j * 11, '#e8e8f0', 'center');
    if (Math.floor(time * 2) % 2 === 0)
      text('E — дальше', VW / 2, VH - 20, '#8a8f98', 'center', '7px monospace');
  } else {
    /* искры */
    if (Math.random() < 0.35) {
      particles.push({
        x: camEndX(), y: 90 + Math.random() * 40, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30,
        t: 1.2, col: ['#ff4a4a', '#ffd76a', '#ffffff', '#ff8a8a'][(Math.random() * 4) | 0], s: Math.random() < 0.5 ? 1 : 2
      });
    }
    for (var k = 0; k < particles.length; k++) {
      var p = particles[k];
      p.t -= 0.016; p.x += p.vx * 0.016; p.y += p.vy * 0.016;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.t));
      ctx.fillStyle = p.col;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
    }
    ctx.globalAlpha = 1;
    particles = particles.filter(function (p) { return p.t > 0; });

    var fl = RP.FINAL_PHRASE;
    var w1 = 'красная сфера это любовь,';
    var w2 = 'красная сфера это жизнь';
    var pulse = 1 + Math.sin(time * 4) * 0.04;
    ctx.save();
    ctx.translate(VW / 2, 80);
    ctx.scale(pulse, pulse);
    if (uictx) { uictx.save(); uictx.translate(VW / 2, 80); uictx.scale(pulse, pulse); }
    textShadow(w1, 0, -12, '#ff4a4a', 'center', 'bold 11px monospace');
    textShadow(w2, 0, 4, '#ff4a4a', 'center', 'bold 11px monospace');
    ctx.restore();
    if (uictx) uictx.restore();
    textShadow('♥', VW / 2, 34, '#ff4a4a', 'center', 'bold 14px monospace');
    if (Math.floor(time * 2) % 2 === 0)
      text('E — титры', VW / 2, VH - 20, '#ffe9a0', 'center', '7px monospace');
  }
}
function camEndX() { return VW / 2 + (Math.random() - 0.5) * 160; }

/* ---------- тосты и баннер ---------- */
function renderToasts() {
  var y = 58;
  for (var i = 0; i < toasts.length; i++) {
    var t = toasts[i];
    var a = Math.min(1, t.t * 2);
    ctx.globalAlpha = a;
    if (uictx) uictx.globalAlpha = a;
    var w = Math.min(VW - 16, t.txt.length * 5 + 14);
    ctx.fillStyle = 'rgba(8,8,16,0.85)';
    ctx.fillRect(8, y - 2, w, 13);
    ctx.strokeStyle = '#5d6677';
    ctx.strokeRect(8.5, y - 1.5, w - 1, 12);
    text(t.txt, 14, y, '#ffe9a0');
    ctx.globalAlpha = 1;
    if (uictx) uictx.globalAlpha = 1;
    y += 16;
  }
}
function renderBanner() {
  if (banner.t <= 0) return;
  var a = Math.min(1, banner.t, (2.6 - banner.t) * 3);
  ctx.globalAlpha = Math.max(0, a);
  if (uictx) uictx.globalAlpha = Math.max(0, a);
  var w = banner.text.length * 8 + 24;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(VW / 2 - w / 2, 22, w, 20);
  ctx.strokeStyle = '#ffe9a0';
  ctx.strokeRect(VW / 2 - w / 2 + 0.5, 22.5, w - 1, 19);
  textShadow(banner.text, VW / 2, 27, '#ffe9a0', 'center', 'bold 10px monospace');
  ctx.globalAlpha = 1;
  if (uictx) uictx.globalAlpha = 1;
}

/* ---------- общий рендер ---------- */
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, VW, VH);
  if (uictx) {
    uictx.setTransform(1, 0, 0, 1, 0, 0);
    uictx.clearRect(0, 0, VW * UIPX, VH * UIPX);
    uictx.setTransform(UIPX, 0, 0, UIPX, 0, 0);
  }
  if (state === 'title') { renderTitle(); return; }
  if (state === 'controls') { renderControls(); return; }

  var shx = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0;
  var shy = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0;
  ctx.save();
  ctx.translate(shx, shy);
  renderWorld();
  ctx.restore();

  renderHUD();

  if (state === 'dialog') renderDialog();
  if (state === 'quests') renderQuestLog();
  if (state === 'pause') renderPause();
  if (state === 'gameover') renderGameOver();
  if (state === 'ending' || state === 'credits') renderEnding();

  if (state !== 'ending' && state !== 'credits') {
    renderToasts();
    renderBanner();
  }
  /* затемнение при переходе */
  if (fade.a > 0) {
    ctx.fillStyle = 'rgba(0,0,0,' + fade.a + ')';
    ctx.fillRect(0, 0, VW, VH);
    if (uictx) {
      uictx.fillStyle = 'rgba(0,0,0,' + fade.a + ')';
      uictx.fillRect(0, 0, VW, VH);
    }
  }
}
