/* ============================================================
   РОМАН: ПИКСЕЛЬНОЕ ПРИКЛЮЧЕНИЕ — sprites.js
   Пиксель-арт: персонажи, враги, предметы, тайлы (процедурно)
   ============================================================ */
var RP = (typeof window !== 'undefined')
  ? (window.RP = window.RP || {})
  : (globalThis.RP = globalThis.RP || {});

/* ---------- утилиты ---------- */
RP.makeCanvas = function (w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
RP.mulberry32 = mulberry32;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
RP.clamp = clamp;

function shade(hex, amt) {
  if (!hex || hex[0] !== '#') return hex;
  var n = parseInt(hex.slice(1), 16);
  var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r = r * (1 + amt); g = g * (1 + amt); b = b * (1 + amt); }
  else { r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt; }
  r = clamp(Math.round(r), 0, 255); g = clamp(Math.round(g), 0, 255); b = clamp(Math.round(b), 0, 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
RP.shade = shade;

function R(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
RP.R = R;

/* пиксельный круг: ряды ширин */
function disc(g, cx, cy, r, col) {
  for (var dy = -r; dy <= r; dy++) {
    var w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    if (w > 0) R(g, cx - w, cy + dy, w * 2, 1, col);
  }
}
RP.disc = disc;

/* ---------- человекообразные ---------- */
function frameHuman(o, dir, step) {
  var c = RP.makeCanvas(16, 16), g = c.getContext('2d');
  var skin = o.skin || '#e9b98e', sk2 = shade(skin, -0.18);
  var hair = o.hair || '#2e2018', hair2 = shade(hair, 0.22);
  var shirt = o.shirt || '#f0f0f0', sh2 = shade(shirt, -0.18);
  var pants = o.pants || '#3a5bd9', shoes = o.shoes || '#d0342c';
  var belt = o.belt || '#26262f';
  var EYE = '#14141d';

  if (dir === 'down' || dir === 'up') {
    /* голова */
    R(g, 4, 1, 8, 7, skin);
    R(g, 4, 1, 8, 2, hair);
    R(g, 4, 3, 1, 3, hair);
    R(g, 11, 3, 1, 3, hair);
    if (dir === 'down') {
      R(g, 4, 3, 8, 1, hair);
      R(g, 6, 5, 1, 2, EYE);
      R(g, 9, 5, 1, 2, EYE);
      R(g, 7, 7, 2, 1, sk2);
      if (o.brows) { R(g, 6, 4, 1, 1, EYE); R(g, 9, 4, 1, 1, EYE); }
    } else {
      R(g, 4, 3, 8, 5, hair);
      R(g, 5, 2, 6, 1, hair2);
    }
    if (o.cap) { R(g, 4, 1, 8, 2, o.cap); R(g, 3, 3, 10, 1, o.cap); }
    if (o.spikes) {
      R(g, 3, 4, 1, 3, hair); R(g, 2, 5, 1, 2, hair);
      R(g, 12, 4, 1, 3, hair); R(g, 13, 5, 1, 2, hair);
    }
    /* корпус */
    if (o.dress) {
      R(g, 4, 8, 8, 4, shirt);
      R(g, 3, 12, 10, 2, shirt);
      R(g, 3, 12, 10, 1, sh2);
      R(g, 3, 8, 1, 3, shirt); R(g, 12, 8, 1, 3, shirt);
      R(g, 3, 11, 1, 1, skin); R(g, 12, 11, 1, 1, skin);
      R(g, 5, 14, 2, 2, shoes); R(g, 9, 14, 2, 2, shoes);
    } else {
      R(g, 4, 8, 8, 4, shirt);
      R(g, 11, 8, 1, 4, sh2);
      R(g, 3, 8, 1, 3, shirt); R(g, 12, 8, 1, 3, shirt);
      R(g, 3, 11, 1, 1, skin); R(g, 12, 11, 1, 1, skin);
      R(g, 4, 11, 8, 1, belt);
      if (step === 0) {
        R(g, 5, 12, 3, 2, pants); R(g, 8, 12, 3, 2, pants);
        R(g, 5, 14, 3, 2, shoes); R(g, 8, 14, 3, 2, shoes);
      } else {
        R(g, 4, 12, 3, 2, pants); R(g, 9, 12, 3, 2, pants);
        R(g, 4, 14, 3, 2, shoes); R(g, 9, 14, 3, 2, shoes);
      }
    }
  } else { /* side — смотрит вправо */
    R(g, 4, 1, 8, 7, skin);
    R(g, 4, 1, 8, 2, hair);
    R(g, 4, 3, 4, 5, hair);
    if (o.spikes) {
      R(g, 3, 2, 2, 2, hair); R(g, 1, 5, 3, 2, hair); R(g, 3, 7, 2, 2, hair);
    }
    R(g, 9, 5, 1, 2, EYE);
    R(g, 11, 6, 1, 1, sk2);
    R(g, 9, 7, 2, 1, sk2);
    if (o.cap) { R(g, 4, 1, 8, 2, o.cap); R(g, 6, 3, 7, 1, o.cap); }
    if (o.dress) {
      R(g, 5, 8, 6, 4, shirt);
      R(g, 3, 12, 10, 2, shirt);
      R(g, 3, 12, 10, 1, sh2);
      R(g, 10, 9, 2, 3, shirt); R(g, 11, 12, 1, 1, skin);
      R(g, 5, 14, 2, 2, shoes); R(g, 9, 14, 2, 2, shoes);
    } else {
      R(g, 5, 8, 6, 4, shirt);
      R(g, 4, 8, 1, 3, shirt); R(g, 4, 11, 1, 1, skin);
      R(g, 10, 8, 1, 3, shirt); R(g, 10, 11, 1, 1, skin);
      R(g, 5, 11, 6, 1, belt);
      if (step === 0) {
        R(g, 6, 12, 2, 2, pants); R(g, 8, 12, 3, 2, pants);
        R(g, 5, 14, 3, 2, shoes); R(g, 8, 14, 4, 2, shoes);
      } else {
        R(g, 5, 12, 3, 2, pants); R(g, 9, 12, 2, 2, pants);
        R(g, 4, 14, 4, 2, shoes); R(g, 9, 14, 3, 2, shoes);
      }
    }
  }
  return c;
}

/* Роман: пропорции и анимация frameHuman, но упрощённые читаемые
   детали — очки на лице, чёрная letterman-куртка, белые рукава */
function frameRoman(o, dir, step) {
  var c = RP.makeCanvas(16, 16), g = c.getContext('2d');
  var skin = '#efc49a', sk2 = shade(skin, -0.18);
  var hair = '#17130f', hair2 = shade(hair, 0.35);
  var JK = '#17181d';
  var SLV = '#e6e2d6';
  var shirt = '#eceadf';
  var jeans = '#33415e';
  var shoes = '#16161b';
  var FRAME = '#14141d', LENS = '#b9c9d8', EYE = '#14141d';

  if (dir === 'down' || dir === 'up') {
    /* голова */
    R(g, 4, 1, 8, 7, skin);
    R(g, 4, 1, 8, 2, hair);
    R(g, 4, 3, 1, 3, hair);
    R(g, 11, 3, 1, 3, hair);
    if (dir === 'down') {
      R(g, 4, 3, 8, 1, hair);
      /* очки: светлые линзы, зрачки, рамка сверху и по бокам —
         нос и рот остаются открытыми */
      R(g, 5, 4, 3, 3, LENS); R(g, 9, 4, 3, 3, LENS);
      R(g, 6, 5, 1, 1, EYE); R(g, 10, 5, 1, 1, EYE);
      R(g, 5, 4, 3, 1, FRAME); R(g, 9, 4, 3, 1, FRAME);
      R(g, 5, 4, 1, 3, FRAME); R(g, 7, 4, 1, 3, FRAME);
      R(g, 9, 4, 1, 3, FRAME); R(g, 11, 4, 1, 3, FRAME);
      R(g, 7, 7, 2, 1, sk2);
    } else {
      R(g, 4, 3, 8, 5, hair);
      R(g, 5, 2, 6, 1, hair2);
      R(g, 3, 5, 1, 2, FRAME); R(g, 12, 5, 1, 2, FRAME);
    }
    /* корпус: три чистые вертикали — рукава, куртка, футболка */
    R(g, 4, 8, 8, 4, JK);
    if (dir !== 'up') R(g, 6, 8, 4, 3, shirt);
    R(g, 3, 8, 1, 3, SLV); R(g, 12, 8, 1, 3, SLV);
    R(g, 3, 11, 1, 1, skin); R(g, 12, 11, 1, 1, skin);
    R(g, 4, 11, 8, 1, SLV);
    /* джинсы */
    if (step === 0) {
      R(g, 5, 12, 3, 2, jeans); R(g, 8, 12, 3, 2, jeans);
      R(g, 5, 14, 3, 2, shoes); R(g, 8, 14, 3, 2, shoes);
    } else {
      R(g, 4, 12, 3, 2, jeans); R(g, 9, 12, 3, 2, jeans);
      R(g, 4, 14, 3, 2, shoes); R(g, 9, 14, 3, 2, shoes);
    }
  } else { /* side — смотрит вправо */
    R(g, 4, 1, 8, 7, skin);
    R(g, 4, 1, 8, 2, hair);
    R(g, 4, 3, 4, 5, hair);
    /* очки сбоку: ободок, линза с зрачком, дужка к затылку */
    R(g, 8, 4, 4, 1, FRAME);
    R(g, 9, 5, 3, 3, LENS);
    R(g, 10, 5, 1, 1, EYE);
    R(g, 5, 5, 4, 1, FRAME);
    /* корпус */
    R(g, 5, 8, 6, 4, JK);
    R(g, 4, 8, 1, 3, SLV); R(g, 4, 11, 1, 1, skin);
    R(g, 10, 8, 1, 3, SLV); R(g, 10, 11, 1, 1, skin);
    R(g, 5, 11, 6, 1, SLV);
    if (step === 0) {
      R(g, 6, 12, 2, 2, jeans); R(g, 8, 12, 3, 2, jeans);
      R(g, 5, 14, 3, 2, shoes); R(g, 8, 14, 4, 2, shoes);
    } else {
      R(g, 5, 12, 3, 2, jeans); R(g, 9, 12, 2, 2, jeans);
      R(g, 4, 14, 4, 2, shoes); R(g, 9, 14, 3, 2, shoes);
    }
  }
  return c;
}

/* ожилые существа с иголками (Соники) */
function frameHedge(o, dir, step) {
  var c = RP.makeCanvas(16, 16), g = c.getContext('2d');
  var body = o.body || '#8a94a6', body2 = shade(body, -0.25), belly = o.belly || '#e8e4da';
  var shoe = o.shoe || '#d0342c', EYE = '#14141d';

  if (dir === 'down' || dir === 'up') {
    disc(g, 8, 6, 5, body);
    R(g, 3, 4, 1, 3, body); R(g, 12, 4, 1, 3, body);
    R(g, 2, 6, 1, 2, body); R(g, 13, 6, 1, 2, body);
    if (dir === 'down') {
      R(g, 6, 5, 1, 2, '#ffffff'); R(g, 9, 5, 1, 2, '#ffffff');
      if (o.evil) { R(g, 6, 6, 1, 1, '#ff2b2b'); R(g, 9, 6, 1, 1, '#ff2b2b'); }
      else { R(g, 6, 6, 1, 1, EYE); R(g, 9, 6, 1, 1, EYE); }
      R(g, 7, 8, 2, 1, shade(body, -0.4));
    } else {
      R(g, 5, 3, 6, 2, shade(body, 0.15));
    }
    R(g, 5, 10, 6, 4, belly);
    R(g, 4, 10, 1, 3, body); R(g, 11, 10, 1, 3, body);
    if (step === 0) {
      R(g, 5, 14, 3, 2, shoe); R(g, 8, 14, 3, 2, shoe);
      R(g, 5, 13, 3, 1, '#ffffff');
    } else {
      R(g, 4, 14, 3, 2, shoe); R(g, 9, 14, 3, 2, shoe);
      R(g, 4, 13, 3, 1, '#ffffff'); R(g, 9, 13, 3, 1, '#ffffff');
    }
  } else {
    disc(g, 9, 6, 5, body);
    /* ёж влево от головы */
    R(g, 4, 3, 3, 2, body); R(g, 2, 5, 4, 2, body); R(g, 3, 7, 4, 2, body);
    R(g, 5, 9, 3, 2, body);
    R(g, 9, 5, 1, 2, '#ffffff');
    if (o.evil) R(g, 9, 6, 1, 1, '#ff2b2b'); else R(g, 9, 6, 1, 1, EYE);
    R(g, 11, 7, 1, 1, shade(body, -0.4));
    R(g, 7, 10, 5, 4, belly);
    if (step === 0) {
      R(g, 7, 14, 4, 2, shoe); R(g, 7, 13, 4, 1, '#ffffff');
      R(g, 3, 14, 3, 2, shoe);
    } else {
      R(g, 9, 14, 4, 2, shoe); R(g, 9, 13, 4, 1, '#ffffff');
      R(g, 4, 14, 3, 2, shoe);
    }
  }
  return c;
}

RP.makeChar = function (o) {
  var fn = o.hedge ? frameHedge : (o.roman ? frameRoman : frameHuman);
  return {
    down: [fn(o, 'down', 0), fn(o, 'down', 1)],
    up: [fn(o, 'up', 0), fn(o, 'up', 1)],
    side: [fn(o, 'side', 0), fn(o, 'side', 1)]
  };
};

/* ---------- враги ---------- */
RP.makeDrone = function (col) {
  col = col || '#6a7280';
  var out = [];
  for (var f = 0; f < 2; f++) {
    var c = RP.makeCanvas(16, 16), g = c.getContext('2d');
    if (f === 0) { R(g, 1, 2, 14, 1, '#343945'); R(g, 7, 1, 2, 3, '#343945'); }
    else { R(g, 3, 2, 10, 1, '#343945'); R(g, 7, 1, 2, 3, '#343945'); }
    R(g, 6, 4, 4, 2, '#343945');
    R(g, 4, 6, 8, 6, shade(col, -0.35));
    R(g, 5, 7, 6, 4, col);
    R(g, 5, 8, 3, 2, '#ff3b3b');
    R(g, 6, 8, 1, 1, '#ffd9d9');
    R(g, 4, 12, 2, 2, '#343945');
    R(g, 10, 12, 2, 2, '#343945');
    out.push(c);
  }
  return out;
};

RP.makeMutant = function (col) {
  col = col || '#4f9a4a';
  var dark = shade(col, -0.4), tooth = '#f2f2ea', EYE = '#ffe14a';
  var out = [];
  for (var f = 0; f < 2; f++) {
    var c = RP.makeCanvas(16, 16), g = c.getContext('2d');
    R(g, 3, 7, 10, 7, col);
    R(g, 3, 12, 10, 2, dark);
    R(g, 4, 3, 8, 5, col);
    R(g, 4, 3, 8, 1, shade(col, 0.2));
    /* глаза */
    R(g, 5, 5, 2, 2, EYE); R(g, 9, 5, 2, 2, EYE);
    R(g, 6, 5, 1, 1, '#101018'); R(g, 10, 5, 1, 1, '#101018');
    /* рот */
    R(g, 5, 7, 7, 2, '#181b22');
    if (f === 0) {
      R(g, 6, 7, 1, 1, tooth); R(g, 8, 7, 1, 1, tooth); R(g, 10, 7, 1, 1, tooth);
      R(g, 7, 8, 1, 1, tooth); R(g, 9, 8, 1, 1, tooth);
      R(g, 2, 7, 2, 4, col); R(g, 12, 7, 2, 4, col);
      R(g, 4, 14, 3, 2, dark); R(g, 9, 14, 3, 2, dark);
    } else {
      R(g, 5, 7, 7, 1, tooth);
      R(g, 2, 8, 2, 4, col); R(g, 12, 8, 2, 4, col);
      R(g, 3, 14, 4, 2, dark); R(g, 9, 14, 3, 2, dark);
    }
    out.push(c);
  }
  return out;
};

RP.makeFogPuff = function (size, col) {
  col = col || '#9fb0c8';
  var out = [];
  for (var f = 0; f < 3; f++) {
    var c = RP.makeCanvas(size, size), g = c.getContext('2d');
    var cx = size / 2, cy = size / 2;
    var ph = f / 3 * Math.PI * 2;
    disc(g, cx - 3 + Math.sin(ph) * 2, cy - 2, size * 0.3, shade(col, -0.15));
    disc(g, cx + 4 + Math.cos(ph) * 2, cy + 1, size * 0.26, shade(col, -0.15));
    disc(g, cx + Math.sin(ph + 1) * 3, cy + 4, size * 0.28, shade(col, -0.15));
    disc(g, cx, cy, size * 0.33, col);
    disc(g, cx - 2, cy - 3, size * 0.18, shade(col, 0.18));
    if (size >= 24) {
      if (f % 2 === 0) {
        R(g, cx - 6, cy - 1, 4, 3, '#ff3b3b');
        R(g, cx + 3, cy - 1, 4, 3, '#ff3b3b');
        R(g, cx - 5, cy, 2, 1, '#7a0d10');
        R(g, cx + 4, cy, 2, 1, '#7a0d10');
      } else {
        R(g, cx - 6, cy, 4, 2, '#ff3b3b');
        R(g, cx + 3, cy, 4, 2, '#ff3b3b');
      }
      R(g, cx - 3, cy + 5, 7, 2, '#2a2f3a');
      R(g, cx - 2, cy + 5, 1, 2, '#f0f0f0'); R(g, cx + 1, cy + 5, 1, 2, '#f0f0f0');
    }
    out.push(c);
  }
  return out;
};

RP.makeSphereling = function () {
  var out = [];
  for (var f = 0; f < 2; f++) {
    var c = RP.makeCanvas(12, 12), g = c.getContext('2d');
    disc(g, 6, 6, f === 0 ? 5 : 4, '#d02f2f');
    disc(g, 6, f === 0 ? 6 : 7, f === 0 ? 4 : 4, '#e63b3b');
    R(g, 3, f === 0 ? 3 : 4, 3, 2, '#ff9d9d');
    R(g, 3, 5, 2, 2, '#ffffff'); R(g, 8, 5, 2, 2, '#ffffff');
    R(g, 4, 6, 1, 1, '#14141d'); R(g, 9, 6, 1, 1, '#14141d');
    R(g, 4, 4, 2, 1, '#7a1418'); R(g, 7, 4, 2, 1, '#7a1418');
    out.push(c);
  }
  return out;
};

RP.makeCar = function (col) {
  col = col || '#3f6fd8';
  var c = RP.makeCanvas(24, 14), g = c.getContext('2d');
  R(g, 1, 6, 22, 5, col);
  R(g, 1, 9, 22, 2, shade(col, -0.3));
  R(g, 6, 2, 12, 5, shade(col, -0.1));
  R(g, 7, 3, 9, 3, '#a8dcf5');
  R(g, 12, 3, 1, 3, shade(col, -0.35));
  R(g, 4, 11, 5, 3, '#17171d');
  R(g, 15, 11, 5, 3, '#17171d');
  R(g, 6, 12, 1, 1, '#9aa0ab'); R(g, 17, 12, 1, 1, '#9aa0ab');
  R(g, 21, 7, 3, 2, '#ffe9a0');
  R(g, 1, 7, 2, 2, '#e0503a');
  return c;
};

RP.makeEvilSonic = function (boss) {
  var out = [];
  var size = boss ? 24 : 16;
  for (var f = 0; f < 2; f++) {
    var c = RP.makeCanvas(size, size), g = c.getContext('2d');
    var s = size / 16, dy = (f === 1 ? -1 : 0) * s;
    var body = '#5f6a80', dark = '#3d4557', belly = '#d9d4c8', shoe = '#d0342c';
    var k = function (x, y, w, h, col) { R(g, Math.round(x * s), Math.round(y * s) + dy, Math.round(w * s), Math.round(h * s), col); };
    /* иголки назад-влево */
    k(5, 3, 3, 2, body); k(3, 5, 4, 2, body); k(4, 7, 4, 2, body); k(6, 9, 3, 2, body);
    disc(g, 9 * s, 6 * s + dy, 5 * s, body);
    k(9, 4, 3, 3, '#ffffff');
    k(10, 5, 2, 2, '#ff2b2b');
    k(9, 8, 3, 1, dark);
    k(7, 10, 5, 4, belly);
    k(5, 10, 2, 3, body); k(12, 10, 2, 3, body);
    k(5, 14, 3, 2, shoe); k(4, 13, 4, 1, '#ffffff');
    k(9, 14, 3, 2, shoe); k(9, 13, 4, 1, '#ffffff');
    if (boss) { /* немного крупнее глаза и оскал */
      k(9, 8, 4, 1, '#14141d');
    }
    out.push(c);
  }
  return out;
};

RP.makeDroneMaster = function () {
  var out = [];
  for (var f = 0; f < 2; f++) {
    var c = RP.makeCanvas(32, 24), g = c.getContext('2d');
    var k = function (x, y, w, h, col) { R(g, x, y + (f === 1 ? -1 : 0), w, h, col); };
    if (f === 0) { R(g, 2, 2, 28, 2, '#343945'); R(g, 14, 0, 4, 4, '#343945'); }
    else { R(g, 6, 2, 20, 2, '#343945'); R(g, 14, 0, 4, 4, '#343945'); }
    k(6, 5, 20, 4, '#343945');
    k(4, 8, 24, 11, '#4a5261');
    k(6, 10, 20, 7, '#5d6677');
    k(12, 11, 8, 5, '#ff3b3b');
    k(14, 12, 4, 3, '#ffd9d9');
    k(2, 12, 4, 6, '#343945'); k(26, 12, 4, 6, '#343945');
    k(2, 17, 3, 3, '#22262f'); k(27, 17, 3, 3, '#22262f');
    k(8, 19, 5, 3, '#343945'); k(19, 19, 5, 3, '#343945');
    out.push(c);
  }
  return out;
};

RP.makeQueen = function () {
  var out = [];
  for (var f = 0; f < 2; f++) {
    var c = RP.makeCanvas(32, 32), g = c.getContext('2d');
    var dy = f === 1 ? -1 : 0;
    disc(g, 16, 18 + dy, 13, '#b32626');
    disc(g, 16, 17 + dy, 12, '#e13a3a');
    R(g, 8, 10 + dy, 16, 3, '#ff8f8f');
    /* корона */
    R(g, 7, 1 + dy, 3, 5, '#f2c53d');
    R(g, 12, 0 + dy, 3, 6, '#f2c53d');
    R(g, 17, 0 + dy, 3, 6, '#f2c53d');
    R(g, 22, 1 + dy, 3, 5, '#f2c53d');
    R(g, 7, 5 + dy, 18, 3, '#d9a72c');
    /* глаза */
    R(g, 10, 16 + dy, 5, 5, '#ffffff');
    R(g, 18, 16 + dy, 5, 5, '#ffffff');
    R(g, 12, 18 + dy, 2, 3, '#14141d');
    R(g, 19, 18 + dy, 2, 3, '#14141d');
    R(g, 10, 15 + dy, 5, 1, '#7a1418');
    R(g, 18, 15 + dy, 5, 1, '#7a1418');
    /* рот */
    R(g, 11, 24 + dy, 10, 4, '#6d1014');
    R(g, 12, 24 + dy, 2, 2, '#f0f0f0'); R(g, 16, 24 + dy, 2, 2, '#f0f0f0'); R(g, 19, 24 + dy, 2, 2, '#f0f0f0');
    out.push(c);
  }
  return out;
};

RP.makeFogBoss = function () {
  var out = [];
  for (var f = 0; f < 3; f++) {
    var c = RP.makeCanvas(32, 32), g = c.getContext('2d');
    var ph = f / 3 * Math.PI * 2;
    disc(g, 12 + Math.sin(ph) * 2, 12, 10, '#8e9fb8');
    disc(g, 20 + Math.cos(ph) * 2, 14, 9, '#8e9fb8');
    disc(g, 16, 20 + Math.sin(ph + 2) * 2, 10, '#7f90a8');
    disc(g, 16, 14, 11, '#a3b3ca');
    disc(g, 13, 10, 5, '#b8c5d6');
    /* череп */
    R(g, 10, 12, 12, 10, '#eef1f5');
    R(g, 10, 20, 12, 3, '#d7dce4');
    R(g, 12, 15, 4, 4, '#171a22');
    R(g, 17, 15, 4, 4, '#171a22');
    R(g, 13, 16, 2, 2, '#ff3b3b'); R(g, 18, 16, 2, 2, '#ff3b3b');
    R(g, 15, 19, 2, 2, '#171a22');
    R(g, 11, 22, 1, 3, '#eef1f5'); R(g, 14, 22, 1, 3, '#eef1f5');
    R(g, 17, 22, 1, 3, '#eef1f5'); R(g, 20, 22, 1, 3, '#eef1f5');
    out.push(c);
  }
  return out;
};

/* ---------- предметы ---------- */
RP.makeSphere = function () {
  var out = [];
  for (var f = 0; f < 2; f++) {
    var c = RP.makeCanvas(8, 8), g = c.getContext('2d');
    disc(g, 4, 4, 4, '#a82424');
    disc(g, 4, 4, 3, '#e13a3a');
    R(g, 2, 2, 2, 2, '#ff9d9d');
    if (f === 1) R(g, 4, 1, 1, 1, '#ffffff');
    R(g, 5, 5, 2, 2, '#ff6b6b');
    out.push(c);
  }
  return out;
};

RP.makePhoto = function () {
  var c = RP.makeCanvas(10, 8), g = c.getContext('2d');
  R(g, 0, 0, 10, 8, '#f4f4f4');
  R(g, 1, 1, 8, 5, '#22346f');
  disc(g, 5, 3, 2, '#5ab0ff');
  R(g, 3, 5, 2, 1, '#e13a3a');
  R(g, 1, 6, 8, 1, '#dcdcdc');
  R(g, 7, 6, 1, 1, '#9aa0ab');
  return c;
};

RP.makeGoo = function () {
  var c = RP.makeCanvas(10, 12), g = c.getContext('2d');
  R(g, 3, 0, 4, 3, '#aab0ba');
  R(g, 4, 0, 2, 1, '#d4d9e0');
  R(g, 1, 3, 8, 9, '#dfe4ea');
  R(g, 2, 4, 2, 7, '#ffffff');
  R(g, 6, 5, 2, 5, '#c3c9d2');
  R(g, 1, 7, 8, 3, '#e13a3a');
  R(g, 4, 7, 2, 3, '#ffffff');
  return c;
};

RP.makeBike = function () {
  var c = RP.makeCanvas(16, 10), g = c.getContext('2d');
  disc(g, 4, 6, 4, '#1d2027');
  disc(g, 4, 6, 2, '#3a3f4a');
  disc(g, 12, 6, 4, '#1d2027');
  disc(g, 12, 6, 2, '#3a3f4a');
  R(g, 4, 4, 8, 1, '#e13a3a');
  R(g, 5, 2, 5, 1, '#e13a3a');
  R(g, 5, 2, 1, 3, '#e13a3a');
  R(g, 10, 1, 4, 1, '#1d2027');
  R(g, 13, 1, 1, 4, '#1d2027');
  R(g, 7, 5, 2, 2, '#8a8f98');
  R(g, 3, 1, 4, 1, '#1d2027');
  return c;
};

RP.makeCard = function (kind) {
  var c = RP.makeCanvas(10, 8), g = c.getContext('2d');
  if (kind === 'pass') {
    R(g, 0, 1, 10, 6, '#f2c53d');
    R(g, 1, 2, 8, 1, '#7a5a10');
    R(g, 1, 4, 5, 2, '#c9861a');
    R(g, 7, 4, 2, 2, '#7a5a10');
  } else if (kind === 'key') {
    R(g, 0, 2, 5, 5, '#7fd4ff');
    R(g, 1, 3, 3, 3, '#12222e');
    R(g, 4, 4, 6, 2, '#7fd4ff');
    R(g, 8, 6, 2, 1, '#7fd4ff');
  } else if (kind === 'heart') {
    R(g, 1, 1, 3, 2, '#e13a3a'); R(g, 5, 1, 3, 2, '#e13a3a');
    R(g, 0, 2, 9, 3, '#e13a3a');
    R(g, 1, 5, 7, 1, '#e13a3a');
    R(g, 2, 6, 5, 1, '#e13a3a');
    R(g, 3, 7, 3, 1, '#e13a3a');
    R(g, 2, 2, 1, 1, '#ff9d9d');
  } else if (kind === 'gun') {
    R(g, 0, 3, 9, 3, '#5d6677');
    R(g, 1, 4, 6, 1, '#8a93a5');
    R(g, 6, 2, 3, 2, '#e13a3a');
    R(g, 2, 6, 3, 2, '#343945');
  } else { /* diploma */
    R(g, 0, 1, 12, 6, '#f5f0e0');
    R(g, 1, 2, 10, 1, '#b9ac86');
    R(g, 1, 4, 7, 1, '#b9ac86');
    disc(g, 9, 5, 2, '#c93b3b');
  }
  return c;
};

/* ---------- реквизит ---------- */
RP.makeProp = function (kind) {
  var c, g, f;
  switch (kind) {
    case 'tv':
      c = RP.makeCanvas(16, 14); g = c.getContext('2d');
      R(g, 1, 1, 14, 11, '#2a2e38');
      R(g, 2, 2, 12, 9, '#0e1220');
      for (f = 0; f < 24; f++) R(g, 2 + (f * 5 % 12), 2 + (f * 7 % 9), 1, 1, f % 3 ? '#3d7bd8' : '#d8d8e8');
      R(g, 3, 4, 6, 3, '#4a8ae8');
      R(g, 4, 12, 3, 2, '#1a1d26'); R(g, 10, 12, 3, 2, '#1a1d26');
      R(g, 13, 4, 1, 1, '#e13a3a');
      return c;
    case 'cat':
      c = RP.makeCanvas(16, 10); g = c.getContext('2d');
      R(g, 2, 4, 9, 5, '#2b2b36');
      R(g, 10, 2, 5, 5, '#2b2b36');
      R(g, 10, 1, 2, 2, '#2b2b36'); R(g, 13, 1, 2, 2, '#2b2b36');
      R(g, 11, 4, 1, 1, '#8ef07a'); R(g, 14, 4, 1, 1, '#8ef07a');
      R(g, 12, 6, 2, 1, '#e0a0b8');
      R(g, 0, 3, 3, 1, '#2b2b36'); R(g, 0, 2, 1, 2, '#2b2b36');
      R(g, 3, 9, 2, 1, '#2b2b36'); R(g, 8, 9, 2, 1, '#2b2b36');
      return c;
    case 'poster':
      c = RP.makeCanvas(12, 16); g = c.getContext('2d');
      R(g, 0, 0, 12, 16, '#efe9dc');
      R(g, 1, 1, 10, 9, '#1d2a5a');
      disc(g, 6, 5, 3, '#5ab0ff');
      R(g, 4, 7, 2, 1, '#e13a3a'); R(g, 7, 7, 2, 1, '#e13a3a');
      R(g, 2, 11, 8, 1, '#c2352f');
      R(g, 2, 13, 6, 1, '#7d7d8a');
      R(g, 2, 14, 8, 1, '#7d7d8a');
      return c;
    case 'mess':
      c = RP.makeCanvas(12, 8); g = c.getContext('2d');
      R(g, 2, 4, 7, 3, '#9aa0ab');
      R(g, 8, 5, 3, 2, '#9aa0ab');
      R(g, 3, 5, 5, 1, '#787e88');
      R(g, 1, 3, 1, 1, '#6fbf5a'); R(g, 4, 2, 1, 1, '#6fbf5a'); R(g, 7, 3, 1, 1, '#6fbf5a');
      return c;
    case 'board':
      c = RP.makeCanvas(20, 12); g = c.getContext('2d');
      R(g, 0, 0, 20, 12, '#6b4a2a');
      R(g, 1, 1, 18, 10, '#1d4a33');
      R(g, 3, 3, 12, 1, '#dfe6ea');
      R(g, 3, 5, 9, 1, '#dfe6ea');
      R(g, 3, 7, 4, 2, '#e15a5a');
      R(g, 8, 7, 7, 1, '#dfe6ea');
      return c;
    case 'grill':
      c = RP.makeCanvas(16, 16); g = c.getContext('2d');
      R(g, 6, 13, 4, 3, '#343945');
      R(g, 3, 15, 10, 1, '#22262f');
      R(g, 5, 3, 6, 10, '#c9762e');
      R(g, 5, 5, 6, 1, '#a85f22');
      R(g, 5, 8, 6, 1, '#a85f22');
      R(g, 5, 11, 6, 1, '#a85f22');
      R(g, 6, 2, 4, 1, '#e0a04a');
      R(g, 7, 0, 2, 3, '#e8e2d4');
      R(g, 11, 4, 4, 9, '#8a8f98');
      return c;
    case 'bench':
      c = RP.makeCanvas(16, 10); g = c.getContext('2d');
      R(g, 0, 2, 16, 2, '#8a5f3a');
      R(g, 0, 5, 16, 2, '#7a5232');
      R(g, 1, 7, 2, 3, '#4a4a55');
      R(g, 13, 7, 2, 3, '#4a4a55');
      R(g, 0, 0, 16, 1, '#9a6f4a');
      return c;
    case 'bikepile':
      c = RP.makeCanvas(18, 12); g = c.getContext('2d');
      disc(g, 4, 8, 4, '#2b2f3a'); disc(g, 4, 8, 2, '#4a5060');
      disc(g, 14, 8, 4, '#2b2f3a'); disc(g, 14, 8, 2, '#4a5060');
      R(g, 4, 5, 10, 1, '#7a8291');
      R(g, 6, 3, 6, 1, '#c93b3b');
      R(g, 6, 3, 1, 3, '#7a8291');
      R(g, 12, 1, 4, 1, '#2b2f3a');
      R(g, 2, 1, 5, 1, '#3f7a4a');
      R(g, 8, 0, 4, 1, '#8a6a3a');
      return c;
    case 'mush':
      c = RP.makeCanvas(10, 8); g = c.getContext('2d');
      R(g, 4, 4, 3, 4, '#e8e2d4');
      disc(g, 5, 3, 4, '#d13b3b');
      R(g, 3, 2, 1, 1, '#ffffff'); R(g, 6, 1, 1, 1, '#ffffff'); R(g, 7, 4, 1, 1, '#ffffff');
      return c;
    case 'monitor':
      c = RP.makeCanvas(24, 18); g = c.getContext('2d');
      R(g, 0, 0, 24, 14, '#2a2e38');
      R(g, 2, 2, 20, 10, '#0c1018');
      for (f = 0; f < 18; f++) R(g, 3 + (f * 7 % 18), 3 + (f * 5 % 8), 2, 1, f % 4 === 0 ? '#e13a3a' : '#3f9ae0');
      R(g, 4, 4, 10, 2, '#7fe0ff');
      R(g, 9, 14, 6, 2, '#3a3f4a');
      R(g, 5, 16, 14, 2, '#22262f');
      return c;
    case 'portal':
      c = RP.makeCanvas(20, 24); g = c.getContext('2d');
      disc(g, 10, 12, 11, '#241a34');
      disc(g, 10, 12, 8, '#3a2a56');
      disc(g, 10, 12, 6, '#b14aff');
      disc(g, 10, 12, 3, '#f0c8ff');
      R(g, 8, 0, 4, 3, '#241a34'); R(g, 1, 9, 3, 6, '#241a34'); R(g, 16, 9, 3, 6, '#241a34');
      return c;
    case 'sign':
      c = RP.makeCanvas(16, 14); g = c.getContext('2d');
      R(g, 7, 6, 2, 8, '#5d6677');
      R(g, 0, 0, 16, 7, '#dfe4ea');
      R(g, 1, 1, 14, 5, '#2f6fb5');
      R(g, 3, 3, 8, 1, '#ffffff');
      R(g, 10, 2, 2, 3, '#ffffff'); R(g, 12, 3, 2, 1, '#ffffff');
      return c;
    case 'safe':
      c = RP.makeCanvas(14, 14); g = c.getContext('2d');
      R(g, 0, 0, 14, 14, '#4a5060');
      R(g, 1, 1, 12, 12, '#5d6677');
      disc(g, 7, 7, 3, '#343945');
      R(g, 7, 5, 1, 5, '#c9cdd4'); R(g, 5, 7, 5, 1, '#c9cdd4');
      R(g, 11, 6, 2, 5, '#343945');
      return c;
    case 'capsule':
      c = RP.makeCanvas(12, 16); g = c.getContext('2d');
      R(g, 2, 0, 8, 16, '#dfe4ea');
      R(g, 3, 1, 3, 14, '#ffffff');
      R(g, 2, 0, 8, 3, '#aab0ba');
      R(g, 4, 6, 4, 6, '#e13a3a');
      R(g, 5, 7, 2, 4, '#ff9d9d');
      return c;
    case 'phone':
      c = RP.makeCanvas(8, 12); g = c.getContext('2d');
      R(g, 0, 0, 8, 12, '#1d2027');
      R(g, 1, 1, 6, 8, '#7fe0ff');
      R(g, 2, 3, 4, 1, '#0e2a3a'); R(g, 2, 5, 3, 1, '#0e2a3a');
      R(g, 3, 10, 2, 1, '#5d6677');
      return c;
    default:
      c = RP.makeCanvas(8, 8); g = c.getContext('2d');
      R(g, 0, 0, 8, 8, '#8a8f98');
      return c;
  }
};

/* ---------- тайлы ---------- */
RP.TILE_CHARS = {
  '.': 'grass', ',': 'path', 'r': 'road', '#': 'brick', 'H': 'plaster',
  '=': 'wood', 'c': 'carpet', 'f': 'metalFloor', 'F': 'metalWall',
  'W': 'water', 'T': 'tree', 'B': 'bush', '|': 'fence', 'X': 'rock',
  'S': 'sand', 'd': 'window', 'D': 'door', '@': 'bed', 't': 'table',
  's': 'sofa', 'k': 'counter', 'w': 'wardrobe', 'u': 'locker',
  'v': 'conveyor', '~': 'goo', 'p': 'checker', 'A': 'alien', 'a': 'grassA',
  'z': 'junk', 'l': 'lamp', 'o': 'crate', '1': 'console', 'b': 'bookshelf',
  'g': 'grate', 'K': 'fridge', 'Z': 'portalStone', 'L': 'log',
  '0': 'monitor', 'e': 'gate', '*': 'flowers'
};

RP.TILE_INFO = {};
(function () {
  var solid = function (id) { RP.TILE_INFO[id] = { solid: true, variants: 3 }; };
  var walk = function (id, v, anim) { RP.TILE_INFO[id] = { solid: false, variants: v || 3, anim: !!anim }; };
  walk('grass'); walk('grassD'); walk('grassA'); walk('flowers');
  walk('path'); walk('road'); walk('wood'); walk('carpet');
  walk('metalFloor', 3, true); walk('sand'); walk('checker', 1);
  walk('alien'); walk('goo', 3, true); walk('grate'); walk('door', 2);
  solid('brick'); solid('plaster'); solid('metalWall'); solid('water', 3);
  solid('tree'); solid('bush'); solid('fence'); solid('rock');
  solid('window'); solid('bed'); solid('table'); solid('sofa');
  solid('counter'); solid('wardrobe'); solid('locker');
  solid('conveyor', 3); solid('junk'); solid('lamp'); solid('crate');
  solid('console'); solid('bookshelf'); solid('fridge');
  solid('portalStone'); solid('log'); solid('monitor'); solid('gate', 2);
})();

function noise(g, rnd, cols, w, h, density) {
  for (var y = 0; y < h; y++)
    for (var x = 0; x < w; x++)
      if (rnd() < density) R(g, x, y, 1, 1, cols[(rnd() * cols.length) | 0]);
}

function grassDraw(g, rnd, base, dark, light) {
  R(g, 0, 0, 16, 16, base);
  for (var i = 0; i < 14; i++) {
    var x = (rnd() * 16) | 0, y = (rnd() * 16) | 0;
    R(g, x, y, 1, 2, rnd() < 0.5 ? dark : light);
  }
}

RP.TILE_DRAW = {
  grass: function (g, rnd) {
    grassDraw(g, rnd, '#4c8a4a', '#3c7040', '#5c9a56');
    if (rnd() < 0.3) { R(g, (rnd() * 14) | 0, (rnd() * 14) | 0, 1, 1, '#e8e06a'); }
  },
  grassD: function (g, rnd) {
    grassDraw(g, rnd, '#356638', '#27512c', '#427a44');
    if (rnd() < 0.4) { var x = (rnd() * 14) | 0, y = (rnd() * 14) | 0; R(g, x, y, 2, 1, '#27512c'); }
  },
  grassA: function (g, rnd) {
    grassDraw(g, rnd, '#7a49a8', '#5f3786', '#8f5cc0');
    if (rnd() < 0.5) { R(g, (rnd() * 14) | 0, (rnd() * 15) | 0, 1, 1, '#c99aff'); }
  },
  flowers: function (g, rnd) {
    grassDraw(g, rnd, '#4c8a4a', '#3c7040', '#5c9a56');
    var c = ['#ff8fb0', '#ffe14a', '#ffffff', '#8fb0ff'][(rnd() * 4) | 0];
    var x = 2 + ((rnd() * 12) | 0), y = 2 + ((rnd() * 12) | 0);
    R(g, x, y, 2, 2, c); R(g, x, y + 2, 1, 1, '#3c7040');
  },
  path: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#a8895c');
    noise(g, rnd, ['#8f7350', '#b89a6c', '#9c8055'], 16, 16, 0.12);
    if (rnd() < 0.5) { R(g, (rnd() * 12) | 0, (rnd() * 12) | 0, 3, 2, '#9c8055'); }
  },
  road: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#4a4d56');
    noise(g, rnd, ['#3d404a', '#565a64'], 16, 16, 0.1);
    if (rnd() < 0.35) { R(g, (rnd() * 14) | 0, (rnd() * 14) | 0, 2, 1, '#3d404a'); }
  },
  brick: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#9c5142');
    for (var y = 0; y < 16; y += 4) {
      R(g, 0, y + 3, 16, 1, '#7c4034');
      var off = ((y / 4) % 2) ? 0 : 4;
      for (var x = off; x < 16; x += 8) R(g, x, y, 1, 3, '#7c4034');
      for (var i = 0; i < 3; i++) R(g, (rnd() * 15) | 0, y + ((rnd() * 2) | 0), 2, 1, '#a85c4c');
    }
  },
  plaster: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#d9cfa8');
    noise(g, rnd, ['#cec49b', '#e2d9b5'], 16, 16, 0.1);
    R(g, 0, 13, 16, 3, '#c4b98f');
    R(g, 0, 13, 16, 1, '#b0a67c');
  },
  wood: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#8a5f3a');
    for (var y = 0; y < 16; y += 4) {
      R(g, 0, y + 3, 16, 1, '#6e4a2c');
      var sx = (rnd() * 14) | 0;
      R(g, sx, y, 1, 3, '#6e4a2c');
      R(g, 0, y, 16, 1, '#936844');
    }
  },
  carpet: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#3f5aa8');
    noise(g, rnd, ['#36509a', '#4a66b8'], 16, 16, 0.14);
    R(g, 0, 0, 16, 1, '#4a66b8'); R(g, 0, 15, 16, 1, '#31498a');
    if (rnd() < 0.6) { R(g, 6, 6, 4, 4, '#4a66b8'); R(g, 7, 7, 2, 2, '#36509a'); }
  },
  metalFloor: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#585e6a');
    R(g, 0, 0, 16, 1, '#666d7a'); R(g, 0, 15, 16, 1, '#474d58');
    R(g, 0, 7, 16, 1, '#474d58');
    R(g, 7, 0, 1, 16, '#474d58');
    R(g, 2, 2, 1, 1, '#7d848f'); R(g, 13, 2, 1, 1, '#7d848f');
    R(g, 2, 11, 1, 1, '#7d848f'); R(g, 13, 11, 1, 1, '#7d848f');
    if (rnd() < 0.3) R(g, (rnd() * 14) | 0, (rnd() * 14) | 0, 2, 1, '#474d58');
  },
  metalWall: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#3a3f4a');
    R(g, 0, 0, 16, 1, '#4a5060');
    R(g, 0, 7, 16, 1, '#2c303a');
    R(g, 0, 8, 16, 1, '#4a5060');
    for (var x = 2; x < 16; x += 5) R(g, x, 3, 2, 1, '#565e6c');
    R(g, 12, 11, 3, 3, '#22262f');
    noise(g, rnd, ['#333743'], 16, 16, 0.06);
  },
  water: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#2f6fb5');
    noise(g, rnd, ['#2a63a5', '#3a7cc4'], 16, 16, 0.15);
    for (var i = 0; i < 3; i++) {
      var x = (rnd() * 12) | 0, y = (rnd() * 15) | 0;
      R(g, x, y, 3, 1, '#6fb0e8'); R(g, x + 1, y + 1, 2, 1, '#4f92d0');
    }
  },
  tree: function (g, rnd) {
    grassDraw(g, rnd, '#3c7a40', '#2e6133', '#4a8c4d');
    R(g, 7, 11, 3, 5, '#5a3a1c');
    R(g, 7, 11, 1, 5, '#6e4a26');
    disc(g, 8, 7, 6, '#1e5c2c');
    disc(g, 8, 7, 5, '#2b7a3a');
    disc(g, 6, 5, 3, '#3a9148');
    R(g, 10, 4, 1, 1, '#54b25f');
    if (rnd() < 0.5) R(g, 9, 9, 1, 1, '#1e5c2c');
  },
  bush: function (g, rnd) {
    grassDraw(g, rnd, '#3c7a40', '#2e6133', '#4a8c4d');
    disc(g, 8, 10, 6, '#245c30');
    disc(g, 8, 10, 5, '#2f7a3c');
    disc(g, 6, 8, 2, '#3f964c');
    if (rnd() < 0.6) R(g, 10, 8, 1, 1, '#e13a3a');
  },
  fence: function (g, rnd) {
    grassDraw(g, rnd, '#4c8a4a', '#3c7040', '#5c9a56');
    R(g, 0, 4, 16, 2, '#8a6a44');
    R(g, 0, 9, 16, 2, '#7a5c3a');
    R(g, 2, 1, 3, 14, '#9a7a52');
    R(g, 10, 1, 3, 14, '#9a7a52');
    R(g, 2, 1, 1, 14, '#b08a5e');
  },
  rock: function (g, rnd) {
    grassDraw(g, rnd, '#3c7a40', '#2e6133', '#4a8c4d');
    disc(g, 8, 9, 7, '#5f6672');
    disc(g, 8, 9, 6, '#7d848f');
    R(g, 4, 6, 4, 2, '#949aa5');
    R(g, 9, 11, 3, 2, '#5f6672');
    R(g, 11, 5, 1, 1, '#aab0ba');
  },
  sand: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#d9c07c');
    noise(g, rnd, ['#c9b06c', '#e5cf8e', '#bfa462'], 16, 16, 0.16);
    if (rnd() < 0.4) { var x = (rnd() * 14) | 0; R(g, x, (rnd() * 15) | 0, 3, 1, '#c9b06c'); }
  },
  window: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#d9cfa8');
    R(g, 2, 2, 12, 11, '#7ec4e8');
    R(g, 2, 2, 12, 2, '#a8dcf5');
    R(g, 7, 2, 1, 11, '#5d8fa8');
    R(g, 2, 7, 12, 1, '#5d8fa8');
    R(g, 3, 3, 3, 3, '#d8f0ff');
    R(g, 1, 13, 14, 2, '#c4b98f');
    R(g, 4, 14, 8, 1, '#b0a67c');
  },
  door: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#6b4426');
    R(g, 1, 1, 14, 14, '#7d5230');
    R(g, 2, 2, 12, 6, '#6b4426');
    R(g, 2, 9, 12, 5, '#6b4426');
    R(g, 11, 7, 2, 2, '#e0c060');
    if (rnd() < 0.5) R(g, 4, 3, 6, 1, '#5a3820');
    R(g, 0, 0, 16, 1, '#4a2f1a');
    R(g, 0, 15, 16, 1, '#4a2f1a');
  },
  bed: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#6b4426');
    R(g, 1, 1, 14, 14, '#c0392b');
    R(g, 1, 1, 14, 4, '#e8e2d4');
    R(g, 3, 2, 10, 2, '#ffffff');
    R(g, 1, 5, 14, 2, '#d44a3a');
    R(g, 1, 12, 14, 3, '#a82f22');
    if (rnd() < 0.5) R(g, 4, 8, 8, 2, '#d44a3a');
  },
  table: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#7a5232');
    R(g, 0, 0, 16, 9, '#a5744a');
    R(g, 0, 8, 16, 1, '#6e4a2c');
    R(g, 1, 9, 2, 7, '#6e4a2c'); R(g, 13, 9, 2, 7, '#6e4a2c');
    noise(g, rnd, ['#9a6a42'], 16, 8, 0.1);
  },
  sofa: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#7a2f3a');
    R(g, 1, 1, 14, 7, '#b03a4a');
    R(g, 1, 4, 14, 1, '#8f2f3c');
    R(g, 1, 8, 14, 6, '#a03242');
    R(g, 7, 8, 1, 6, '#8f2f3c');
    R(g, 0, 14, 16, 2, '#5f242c');
    if (rnd() < 0.5) R(g, 3, 2, 3, 2, '#c04a5a');
  },
  counter: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#5a5044');
    R(g, 0, 0, 16, 5, '#c9c2b2');
    R(g, 0, 4, 16, 1, '#a49d8c');
    R(g, 0, 5, 16, 1, '#3f3830');
    noise(g, rnd, ['#4f463c'], 16, 16, 0.08);
    R(g, 3, 8, 4, 3, '#8a8f98');
  },
  wardrobe: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#6b4426');
    R(g, 1, 0, 14, 16, '#7d5230');
    R(g, 7, 1, 1, 14, '#5a3820');
    R(g, 5, 7, 2, 1, '#e0c060'); R(g, 9, 7, 2, 1, '#e0c060');
    R(g, 2, 2, 4, 3, '#6b4426'); R(g, 10, 2, 4, 3, '#6b4426');
  },
  locker: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#4a6089');
    R(g, 1, 0, 14, 16, '#5b7fb5');
    R(g, 7, 0, 1, 16, '#3f5478');
    R(g, 3, 3, 8, 1, '#3f5478'); R(g, 3, 5, 8, 1, '#3f5478');
    R(g, 4, 9, 3, 1, '#c9cdd4'); R(g, 11, 8, 2, 3, '#3f5478');
    if (rnd() < 0.4) R(g, 3, 11, 5, 2, '#4a6089');
  },
  conveyor: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#474d58');
    R(g, 0, 2, 16, 12, '#585e6a');
    for (var x = 0; x < 16; x += 4) {
      R(g, x, 3, 2, 10, '#6a717e');
      R(g, x + 2, 3, 1, 10, '#3a3f4a');
    }
    R(g, 0, 0, 16, 2, '#22262f'); R(g, 0, 14, 16, 2, '#22262f');
    R(g, 6, 6, 4, 4, '#e0a02a');
    R(g, 7, 7, 2, 2, '#f2c53d');
  },
  goo: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#585e6a');
    R(g, 0, 7, 16, 1, '#474d58'); R(g, 7, 0, 1, 16, '#474d58');
    disc(g, 8 + ((rnd() * 4) | 0) - 2, 8, 6, '#e9edf2');
    disc(g, 8, 8, 4, '#ffffff');
    R(g, 6, 6, 3, 2, '#ffffff');
    R(g, 11, 11, 2, 2, '#dfe4ea');
  },
  checker: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#e6e6ee');
    R(g, 0, 0, 8, 8, '#171722');
    R(g, 8, 8, 8, 8, '#171722');
    R(g, 0, 0, 16, 1, '#ffffff');
  },
  alien: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#3a2a56');
    noise(g, rnd, ['#453366', '#322449'], 16, 16, 0.14);
    R(g, 0, 7, 16, 1, '#5f4a8a');
    if (rnd() < 0.5) { R(g, 4, 4, 6, 1, '#6a4f9e'); R(g, 6, 10, 5, 1, '#6a4f9e'); }
    if (rnd() < 0.3) { R(g, 11, 3, 2, 2, '#b14aff'); }
  },
  junk: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#6a6258');
    noise(g, rnd, ['#57503f', '#7d7466', '#8a6a44', '#5d6677'], 16, 16, 0.4);
    for (var i = 0; i < 3; i++) {
      var x = (rnd() * 13) | 0, y = (rnd() * 13) | 0;
      R(g, x, y, 3 + ((rnd() * 3) | 0), 2, rnd() < 0.5 ? '#7a5232' : '#5d6677');
    }
    if (rnd() < 0.4) R(g, (rnd() * 14) | 0, (rnd() * 14) | 0, 2, 1, '#c93b3b');
  },
  lamp: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#4a4d56');
    noise(g, rnd, ['#3d404a'], 16, 16, 0.1);
    R(g, 7, 2, 2, 14, '#3a3f4a');
    R(g, 4, 0, 8, 3, '#22262f');
    R(g, 5, 1, 6, 1, '#ffe9a0');
    R(g, 6, 3, 4, 1, '#8a8f98');
  },
  crate: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#7a5232');
    R(g, 1, 1, 14, 14, '#9a6a42');
    R(g, 1, 1, 14, 2, '#a87a4e');
    R(g, 2, 7, 12, 2, '#6e4a2c');
    R(g, 7, 1, 2, 14, '#6e4a2c');
    R(g, 0, 0, 16, 1, '#5a3820'); R(g, 0, 15, 16, 1, '#5a3820');
    if (rnd() < 0.6) R(g, 4, 11, 4, 2, '#5a3820');
  },
  console: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#2a2e38');
    R(g, 1, 1, 14, 10, '#0e1220');
    for (var i = 0; i < 14; i++) R(g, 2 + ((rnd() * 12) | 0), 2 + ((rnd() * 8) | 0), 2, 1, rnd() < 0.4 ? '#e13a3a' : '#3f9ae0');
    R(g, 3, 3, 6, 3, '#7fe0ff');
    R(g, 2, 12, 12, 3, '#3a3f4a');
    R(g, 4, 13, 1, 1, '#6fe07a'); R(g, 6, 13, 1, 1, '#e0c02a');
  },
  bookshelf: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#6b4426');
    R(g, 1, 1, 14, 14, '#5a3820');
    var cols = ['#c93b3b', '#3f7ac9', '#3fae5a', '#e0a02a', '#8a4ac9'];
    for (var sy = 2; sy < 14; sy += 5) {
      R(g, 1, sy + 3, 14, 1, '#3f2712');
      var x = 2;
      while (x < 14) {
        var w = 2 + ((rnd() * 2) | 0);
        if (x + w > 14) break;
        R(g, x, sy, w, 3, cols[(rnd() * cols.length) | 0]);
        x += w + 1;
      }
    }
  },
  grate: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#474d58');
    for (var y = 1; y < 16; y += 4) R(g, 0, y, 16, 2, '#22262f');
    R(g, 0, 0, 16, 1, '#5d6677');
    for (var x = 2; x < 16; x += 6) R(g, x, 0, 1, 16, '#3a3f4a');
  },
  fridge: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#c9cdd4');
    R(g, 1, 0, 14, 16, '#e2e5ea');
    R(g, 1, 7, 14, 1, '#a4aab4');
    R(g, 12, 2, 2, 4, '#8a8f98');
    R(g, 12, 9, 2, 5, '#8a8f98');
    R(g, 3, 3, 5, 2, '#e13a3a');
    R(g, 3, 4, 3, 1, '#ffffff');
    if (rnd() < 0.5) R(g, 4, 10, 4, 3, '#7fe0ff');
  },
  portalStone: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#241a34');
    noise(g, rnd, ['#2e2244', '#1c142a'], 16, 16, 0.2);
    for (var i = 0; i < 4; i++) {
      var x = (rnd() * 14) | 0, y = (rnd() * 14) | 0;
      R(g, x, y, 2, 1, '#b14aff'); R(g, x + 2, y + 1, 2, 1, '#7a2fb1');
    }
    R(g, 0, 15, 16, 1, '#160f22');
  },
  log: function (g, rnd) {
    grassDraw(g, rnd, '#3c7a40', '#2e6133', '#4a8c4d');
    R(g, 0, 5, 16, 7, '#5a3a1c');
    R(g, 0, 5, 16, 1, '#7a5230');
    R(g, 0, 11, 16, 1, '#3f2712');
    disc(g, 13, 8, 3, '#7a5230');
    disc(g, 13, 8, 2, '#5a3a1c');
    disc(g, 13, 8, 1, '#7a5230');
    for (var x = 2; x < 10; x += 4) R(g, x, 6, 1, 5, '#4a2f1a');
  },
  monitor: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#2a2e38');
    R(g, 1, 1, 14, 11, '#0c1018');
    for (var i = 0; i < 12; i++) R(g, 2 + ((rnd() * 12) | 0), 2 + ((rnd() * 8) | 0), 3, 1, rnd() < 0.35 ? '#e13a3a' : '#3f9ae0');
    R(g, 3, 4, 9, 2, '#7fe0ff');
    R(g, 4, 13, 8, 2, '#3a3f4a');
    R(g, 2, 15, 12, 1, '#22262f');
  },
  gate: function (g, rnd) {
    R(g, 0, 0, 16, 16, '#3a3f4a');
    R(g, 1, 0, 14, 16, '#454b58');
    for (var y = 0; y < 16; y += 8) {
      for (var x = 0; x < 16; x += 8) {
        R(g, x, y + 6, 6, 2, '#e0a02a');
        R(g, x + 2, y + 6, 2, 2, '#22262f');
      }
    }
    R(g, 0, 0, 16, 1, '#565e6c');
    R(g, 7, 0, 2, 16, '#22262f');
    R(g, 3, 7, 2, 2, '#e13a3a'); R(g, 11, 7, 2, 2, '#e13a3a');
  },
  grass_alt: function (g, rnd) { grassDraw(g, rnd, '#4c8a4a', '#3c7040', '#5c9a56'); }
};

RP.buildTiles = function () {
  RP.TILES = {};
  for (var id in RP.TILE_INFO) {
    var info = RP.TILE_INFO[id];
    var draw = RP.TILE_DRAW[id];
    if (!draw) draw = RP.TILE_DRAW.grass;
    var frames = [];
    for (var v = 0; v < info.variants; v++) {
      var c = RP.makeCanvas(16, 16), g = c.getContext('2d');
      var rnd = mulberry32(1000 + hashStr(id) * 97 + v * 7919);
      draw(g, rnd, v);
      frames.push(c);
    }
    RP.TILES[id] = frames;
  }
};

function hashStr(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}
RP.hashStr = hashStr;

/* ---------- сборка всех спрайтов ---------- */
RP.buildSprites = function () {
  RP.buildTiles();

  RP.SPR = {};

  RP.SPR.player = RP.makeChar({
    roman: true
  });
  RP.SPR.mama = RP.makeChar({
    hair: '#4a3524', shirt: '#d46a8a', pants: '#7a3f6a', shoes: '#5a3820', dress: true
  });
  RP.SPR.german = RP.makeChar({
    hair: '#8a8f98', shirt: '#5b7fb5', pants: '#3f4a5a', shoes: '#22262f', brows: true
  });
  RP.SPR.max = RP.makeChar({
    hair: '#1d2027', shirt: '#3fae5a', pants: '#5a5044', shoes: '#e0a02a', cap: '#e0a02a'
  });
  RP.SPR.leha = RP.makeChar({
    hair: '#5a3820', shirt: '#e0a02a', pants: '#2a2e38', shoes: '#5d6677', belt: '#7a2f1a'
  });
  RP.SPR.prof = RP.makeChar({
    hair: '#d8d8e0', shirt: '#7a5232', pants: '#4a4a55', shoes: '#22262f', brows: true
  });
  RP.SPR.grib = RP.makeChar({
    hair: '#6a4a2a', shirt: '#8a8f98', pants: '#3f5478', shoes: '#5a3820'
  });
  RP.SPR.sonic = RP.makeChar({
    hedge: true, body: '#8a94a6', belly: '#e8e4da', shoe: '#d0342c'
  });
  RP.SPR.evil = RP.makeChar({
    hedge: true, evil: true, body: '#5f6a80', belly: '#d9d4c8', shoe: '#e13a3a'
  });

  RP.SPR.drone = RP.makeDrone();
  RP.SPR.droneRed = RP.makeDrone('#a04a4a');
  RP.SPR.mutant = RP.makeMutant();
  RP.SPR.mutantPurple = RP.makeMutant('#7a4ac9');
  RP.SPR.fog = RP.makeFogPuff(24, '#9fb0c8');
  RP.SPR.fogPurple = RP.makeFogPuff(24, '#a884c8');
  RP.SPR.sphereling = RP.makeSphereling();
  RP.SPR.car = RP.makeCar('#3f6fd8');
  RP.SPR.carRed = RP.makeCar('#c94a3b');
  RP.SPR.evilBig = RP.makeEvilSonic(true);
  RP.SPR.droneMaster = RP.makeDroneMaster();
  RP.SPR.queen = RP.makeQueen();
  RP.SPR.fogBoss = RP.makeFogBoss();

  RP.SPR.sphere = RP.makeSphere();
  RP.SPR.photo = RP.makePhoto();
  RP.SPR.goo = RP.makeGoo();
  RP.SPR.bike = RP.makeBike();
  RP.SPR.pass = RP.makeCard('pass');
  RP.SPR.key = RP.makeCard('key');
  RP.SPR.heart = RP.makeCard('heart');
  RP.SPR.gun = RP.makeCard('gun');
  RP.SPR.diploma = RP.makeCard('diploma');

  var props = ['tv', 'cat', 'poster', 'mess', 'board', 'grill', 'bench',
    'bikepile', 'mush', 'monitor', 'portal', 'sign', 'safe', 'capsule', 'phone'];
  RP.SPR.props = {};
  for (var i = 0; i < props.length; i++) RP.SPR.props[props[i]] = RP.makeProp(props[i]);
};
