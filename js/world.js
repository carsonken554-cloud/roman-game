/* ============================================================
   РОМАН: ПИКСЕЛЬНОЕ ПРИКЛЮЧЕНИЕ — world.js
   Построители карт и определения зон
   ============================================================ */
var RP = (typeof window !== 'undefined')
  ? (window.RP = window.RP || {})
  : (globalThis.RP = globalThis.RP || {});

/* ---------- построители карт ---------- */
function grid(w, h, ch) {
  var g = [], y, x, row;
  for (y = 0; y < h; y++) { row = []; for (x = 0; x < w; x++) row.push(ch); g.push(row); }
  return g;
}
function rectF(g, x, y, w, h, ch) {
  for (var j = y; j < y + h; j++)
    for (var i = x; i < x + w; i++)
      if (g[j] && g[j][i] !== undefined) g[j][i] = ch;
}
function setG(g, x, y, ch) { if (g[y] && g[y][x] !== undefined) g[y][x] = ch; }
function scat(g, seed, ch, density, test) {
  var rnd = RP.mulberry32(seed);
  var h = g.length, w = g[0].length, x, y;
  for (y = 0; y < h; y++)
    for (x = 0; x < w; x++)
      if (rnd() < density && (!test || test(g[y][x], x, y))) g[y][x] = ch;
}
function rows(g) { var out = []; for (var i = 0; i < g.length; i++) out.push(g[i].join('')); return out; }

RP.ZONES = {};

/* ---- 1. ДОМ РОМЫ ---- */
RP.ZONES.home = {
  name: 'Дом Ромы',
  carve: '=', spawn: { x: 19, y: 21 }, spheres: 4, dark: 0, music: 'home',
  build: function () {
    var g = grid(40, 24, '=');
    rectF(g, 0, 0, 40, 1, '#'); rectF(g, 0, 23, 40, 1, '#');
    rectF(g, 0, 0, 1, 24, '#'); rectF(g, 39, 0, 1, 24, '#');
    rectF(g, 2, 2, 17, 11, 'c');
    rectF(g, 3, 3, 3, 4, '@');
    rectF(g, 12, 3, 4, 2, 't');
    rectF(g, 2, 16, 2, 3, 'w');
    rectF(g, 30, 2, 7, 2, 'k');
    setG(g, 37, 3, 'K');
    rectF(g, 24, 9, 4, 2, 's');
    rectF(g, 24, 13, 3, 2, 't');
    rectF(g, 20, 1, 1, 9, '#');
    setG(g, 20, 5, 'D');
    setG(g, 6, 0, 'd'); setG(g, 7, 0, 'd'); setG(g, 30, 0, 'd');
    setG(g, 19, 23, 'D'); setG(g, 20, 23, 'D');
    return rows(g);
  },
  exits: [{ x: 19, y: 23, w: 2, h: 1, to: 'street', sx: 13, sy: 14, label: 'Выйти на улицу' }],
  npcs: [{ id: 'mama', x: 32, y: 6, spr: 'mama', name: 'Мама Ромы', dlg: 'mama' }],
  props: [
    { x: 7, y: 12, spr: 'mess', name: 'Носки', special: 'mess', id: 'm1', dlg: 'mess' },
    { x: 16, y: 9, spr: 'mess', name: 'Носки', special: 'mess', id: 'm2', dlg: 'mess' },
    { x: 26, y: 17, spr: 'mess', name: 'Носки', special: 'mess', id: 'm3', dlg: 'mess' },
    { x: 35, y: 11, spr: 'mess', name: 'Носки', special: 'mess', id: 'm4', dlg: 'mess' },
    { x: 25, y: 16, spr: 'tv', name: 'Телик', dlg: 'tv' },
    { x: 5, y: 6, spr: 'cat', name: 'Кот Барсик', dlg: 'cat' },
    { x: 8, y: 14, spr: 'poster', name: 'Постер', dlg: 'posterHome' },
    { x: 34, y: 16, spr: 'phone', name: 'Телефон', dlg: 'phone' }
  ],
  items: [{ t: 'photo', id: 'ph_home', x: 12, y: 5 }],
  enemies: []
};

/* ---- 2. УЛИЦЫ АХТУБИНСКА ---- */
RP.ZONES.street = {
  name: 'Улицы Ахтубинска',
  carve: '.', spawn: { x: 20, y: 30 }, spheres: 35, dark: 0, music: 'town',
  build: function () {
    var g = grid(64, 48, '.');
    rectF(g, 0, 20, 64, 5, 'r');
    rectF(g, 28, 0, 5, 48, 'r');
    rectF(g, 0, 19, 64, 1, ',');
    rectF(g, 0, 25, 64, 1, ',');
    rectF(g, 27, 0, 1, 48, ',');
    rectF(g, 33, 0, 1, 48, ',');
    rectF(g, 0, 0, 64, 1, '|'); rectF(g, 0, 47, 64, 1, '|');
    rectF(g, 0, 0, 1, 48, '|'); rectF(g, 63, 0, 1, 48, '|');
    rectF(g, 8, 6, 11, 8, '#');
    setG(g, 13, 13, 'D');
    setG(g, 10, 13, 'd'); setG(g, 11, 13, 'd'); setG(g, 15, 13, 'd'); setG(g, 16, 13, 'd');
    setG(g, 10, 6, 'd'); setG(g, 11, 6, 'd'); setG(g, 15, 6, 'd'); setG(g, 16, 6, 'd');
    rectF(g, 42, 4, 17, 10, 'H');
    setG(g, 50, 13, 'D');
    setG(g, 44, 13, 'd'); setG(g, 45, 13, 'd'); setG(g, 53, 13, 'd'); setG(g, 54, 13, 'd');
    setG(g, 44, 4, 'd'); setG(g, 45, 4, 'd'); setG(g, 48, 4, 'd'); setG(g, 49, 4, 'd');
    setG(g, 53, 4, 'd'); setG(g, 54, 4, 'd'); setG(g, 57, 4, 'd');
    rectF(g, 18, 30, 5, 2, 'k');
    rectF(g, 54, 34, 9, 12, 'F');
    setG(g, 54, 40, 'e');
    setG(g, 56, 34, 'd'); setG(g, 59, 34, 'd'); setG(g, 60, 41, 'd');
    var lamps = [[10, 19], [24, 19], [36, 19], [52, 19], [10, 25], [24, 25], [36, 25], [52, 25]];
    for (var i = 0; i < lamps.length; i++) setG(g, lamps[i][0], lamps[i][1], 'l');
    scat(g, 2024, 'T', 0.05, function (ch, x, y) { return ch === '.' && y < 7; });
    scat(g, 2025, 'B', 0.04, function (ch) { return ch === '.'; });
    scat(g, 2026, '*', 0.03, function (ch) { return ch === '.'; });
    scat(g, 2027, 'T', 0.03, function (ch, x, y) { return ch === '.' && y > 40; });
    setG(g, 6, 47, 'D');
    setG(g, 0, 34, 'D');
    return rows(g);
  },
  exits: [
    { x: 13, y: 13, w: 1, h: 1, to: 'home', sx: 19, sy: 21, label: 'Домой' },
    { x: 50, y: 13, w: 1, h: 1, to: 'school', sx: 10, sy: 31, label: 'В школу' },
    { x: 6, y: 47, w: 1, h: 1, to: 'dump', sx: 1, sy: 16, label: 'На свалку' },
    { x: 0, y: 34, w: 1, h: 1, to: 'forest', sx: 32, sy: 46, label: 'В лес' },
    {
      x: 54, y: 40, w: 1, h: 1, to: 'factory', sx: 27, sy: 37, label: 'На фабрику',
      need: function (G) { return G.keys.pass; },
      msg: 'Замок. Нужен ПРОПУСК на фабрику. Говорят, он у Фога в лесу.'
    }
  ],
  npcs: [
    { id: 'sonic', x: 37, y: 12, spr: 'sonic', name: 'Серый Соник', dlg: 'sonic' },
    { id: 'max', x: 24, y: 34, spr: 'max', name: 'Макс Карпенко', dlg: 'max' },
    { id: 'leha', x: 20, y: 33, spr: 'leha', name: 'Леха-шаурма', dlg: 'leha' }
  ],
  props: [
    { x: 36, y: 13, spr: 'bench', name: 'Лавочка', dlg: 'bench' },
    { x: 25, y: 36, spr: 'bikepile', name: 'Велик Макса', dlg: 'bikepile' },
    { x: 19, y: 29, spr: 'grill', name: 'Гриль', dlg: 'grill' },
    { x: 23, y: 31, spr: 'sign', name: 'Табличка', dlg: 'signStreet' },
    { x: 40, y: 16, spr: 'poster', name: 'Афиша', dlg: 'posterStreet' },
    { x: 44, y: 30, spr: 'cat', name: 'Бродячий кот', dlg: 'cat' },
    { x: 7, y: 38, spr: 'bikepile', name: 'Брошенный велик', dlg: 'bikepile2' }
  ],
  items: [
    { t: 'goo', id: 'g_st1', x: 5, y: 5 },
    { t: 'goo', id: 'g_st2', x: 60, y: 44 },
    { t: 'heart', id: 'h_st1', x: 61, y: 4 }
  ],
  enemies: [
    { t: 'mutant', x: 5, y: 44 }, { t: 'mutant', x: 61, y: 44 },
    { t: 'mutant', x: 5, y: 4 }, { t: 'mutant', x: 37, y: 42 },
    { t: 'mutant', x: 12, y: 44 }, { t: 'drone', x: 20, y: 10 },
    { t: 'drone', x: 45, y: 30 }, { t: 'drone', x: 10, y: 30 },
    { t: 'drone', x: 47, y: 8 }, { t: 'car', x: 4, y: 21, axis: 'x', min: 2, max: 60, dir: 1 },
    { t: 'carRed', x: 58, y: 23, axis: 'x', min: 2, max: 60, dir: -1 }
  ]
};

/* ---- 3. ШКОЛА ---- */
RP.ZONES.school = {
  name: 'Школа №3',
  carve: '=', spawn: { x: 10, y: 31 }, spheres: 15, dark: 0, music: 'town',
  build: function () {
    var g = grid(52, 34, 'H');
    rectF(g, 1, 1, 50, 32, '=');
    rectF(g, 1, 12, 50, 1, 'H');
    setG(g, 8, 12, 'D'); setG(g, 30, 12, 'D');
    rectF(g, 25, 1, 1, 12, 'H');
    rectF(g, 2, 2, 22, 9, 'c');
    rectF(g, 27, 2, 23, 9, 'c');
    rectF(g, 1, 19, 50, 1, 'H');
    setG(g, 10, 19, 'D'); setG(g, 38, 19, 'D');
    rectF(g, 22, 19, 1, 14, 'H');
    rectF(g, 2, 20, 19, 12, 'c');
    rectF(g, 24, 20, 26, 12, 'c');
    var x, y;
    for (x = 4; x <= 18; x += 4) for (y = 4; y <= 8; y += 4) setG(g, x, y, 't');
    for (x = 29; x <= 45; x += 4) for (y = 4; y <= 8; y += 4) setG(g, x, y, 't');
    for (x = 3; x <= 20; x += 3) setG(g, x, 14, 'u');
    for (x = 30; x <= 47; x += 3) setG(g, x, 17, 'u');
    setG(g, 44, 24, 't'); setG(g, 45, 24, 't');
    setG(g, 2, 1, 'd'); setG(g, 50, 1, 'd');
    setG(g, 10, 33, 'D');
    return rows(g);
  },
  exits: [{ x: 10, y: 33, w: 1, h: 1, to: 'street', sx: 50, sy: 15, label: 'На улицу' }],
  npcs: [
    { id: 'german', x: 13, y: 3, spr: 'german', name: 'Герман', dlg: 'german' },
    { id: 'director', x: 44, y: 26, spr: 'prof', name: 'Директор', dlg: 'director' }
  ],
  props: [
    { x: 5, y: 2, spr: 'board', name: 'Доска', dlg: 'board1' },
    { x: 29, y: 2, spr: 'board', name: 'Доска', dlg: 'board2' },
    { x: 49, y: 21, spr: 'safe', name: 'Сейф', dlg: 'safe' },
    { x: 2, y: 31, spr: 'poster', name: 'Плакат', dlg: 'posterSchool' },
    { x: 20, y: 13, spr: 'phone', name: 'Телефон дежурного', dlg: 'phone' },
    { x: 47, y: 31, spr: 'cat', name: 'Школьный кот', dlg: 'cat' }
  ],
  items: [
    { t: 'photo', id: 'ph_sch1', x: 5, y: 30 },
    { t: 'photo', id: 'ph_sch2', x: 48, y: 30 },
    { t: 'goo', id: 'g_sch1', x: 45, y: 5 },
    { t: 'goo', id: 'g_sch2', x: 5, y: 5 }
  ],
  enemies: [
    { t: 'mutant', x: 6, y: 10 }, { t: 'mutant', x: 20, y: 6 },
    { t: 'mutant', x: 30, y: 22 }, { t: 'mutant', x: 47, y: 30 },
    { t: 'mutant', x: 16, y: 26 }, { t: 'drone', x: 26, y: 16 },
    { t: 'drone', x: 40, y: 15 }
  ]
};

/* ---- 4. ЛЕС ---- */
RP.ZONES.forest = {
  name: 'Леса Ахтубинска',
  carve: ',', spawn: { x: 32, y: 45 }, spheres: 30, dark: 0.18, music: 'forest',
  legend: { '.': 'grassD' },
  build: function () {
    var g = grid(64, 48, '.');
    rectF(g, 0, 0, 64, 1, 'X'); rectF(g, 0, 47, 64, 1, 'X');
    rectF(g, 0, 0, 1, 48, 'X'); rectF(g, 63, 0, 1, 48, 'X');
    var y, x;
    for (y = 46; y >= 3; y--) {
      x = 32 + Math.round(6 * Math.sin(y / 5.5));
      setG(g, x, y, ','); setG(g, x + 1, y, ',');
    }
    rectF(g, 25, 3, 15, 10, ',');
    rectF(g, 8, 28, 8, 5, 'W');
    rectF(g, 12, 16, 8, 6, ',');
    scat(g, 777, 'T', 0.11, function (ch) { return ch === '.'; });
    scat(g, 778, 'L', 0.008, function (ch) { return ch === '.'; });
    scat(g, 779, 'B', 0.04, function (ch) { return ch === '.'; });
    /* прямой коридор от спауна к выходу */
    rectF(g, 31, 45, 4, 1, ',');
    rectF(g, 32, 46, 2, 1, ',');
    setG(g, 32, 47, ','); setG(g, 33, 47, ',');
    return rows(g);
  },
  exits: [{ x: 32, y: 47, w: 2, h: 1, to: 'street', sx: 1, sy: 34, label: 'В город' }],
  npcs: [
    { id: 'grib', x: 15, y: 18, spr: 'grib', name: 'Андрей-грибник', dlg: 'grib' }
  ],
  props: [
    { x: 32, y: 3, spr: 'portal', name: 'Странный портал', special: 'forestPortal', dlg: 'portalForest' },
    { x: 14, y: 17, spr: 'mush', name: 'Грибы', dlg: 'mush' },
    { x: 18, y: 20, spr: 'mush', name: 'Грибы', dlg: 'mush2' },
    { x: 10, y: 15, spr: 'sign', name: 'Табличка', dlg: 'signForest' },
    { x: 45, y: 16, spr: 'cat', name: 'Лесной кот', dlg: 'cat' },
    { x: 55, y: 30, spr: 'bikepile', name: 'Веломогильник', dlg: 'bikepile2' }
  ],
  items: [
    { t: 'photo', id: 'ph_for1', x: 50, y: 25 },
    { t: 'goo', id: 'g_for1', x: 10, y: 40 },
    { t: 'goo', id: 'g_for2', x: 55, y: 38 },
    { t: 'heart', id: 'h_for1', x: 5, y: 8 }
  ],
  enemies: [
    { t: 'mutant', x: 10, y: 42 }, { t: 'mutant', x: 54, y: 44 },
    { t: 'mutant', x: 20, y: 30 }, { t: 'mutant', x: 50, y: 20 },
    { t: 'mutant', x: 8, y: 10 }, { t: 'mutant', x: 45, y: 42 },
    { t: 'fog', x: 40, y: 34 }, { t: 'fog', x: 24, y: 22 },
    { t: 'fog', x: 55, y: 15 }, { t: 'fogPurple', x: 20, y: 40 },
    { t: 'drone', x: 32, y: 26 }, { t: 'sphereling', x: 44, y: 10 },
    { t: 'sphereling', x: 20, y: 10 },
    { t: 'fogBoss', x: 32, y: 7, boss: 'fog', hp: 40 }
  ]
};

/* ---- 5. СТРАННАЯ ПУСТОШЬ (ПОРТАЛ) ---- */
RP.ZONES.portal = {
  name: 'Странный портал',
  carve: 'a', spawn: { x: 24, y: 30 }, spheres: 20, dark: 0.4,
  tint: 'rgba(90,40,160,0.13)', music: 'dark',
  build: function () {
    var g = grid(48, 36, 'a');
    rectF(g, 0, 0, 48, 1, 'X'); rectF(g, 0, 35, 48, 1, 'X');
    rectF(g, 0, 0, 1, 36, 'X'); rectF(g, 47, 0, 1, 36, 'X');
    rectF(g, 16, 10, 16, 14, 'p');
    rectF(g, 20, 24, 8, 8, 'A');
    scat(g, 555, 'Z', 0.03, function (ch) { return ch === 'a'; });
    scat(g, 556, 'A', 0.02, function (ch) { return ch === 'a'; });
    setG(g, 24, 35, 'D');
    return rows(g);
  },
  exits: [{ x: 24, y: 35, w: 1, h: 1, to: 'forest', sx: 32, sy: 13, label: 'Обратно в лес' }],
  npcs: [],
  props: [
    { x: 24, y: 14, spr: 'portal', name: 'Портал в измерение', special: 'toSonic', dlg: 'portalSonic' },
    { x: 17, y: 11, spr: 'capsule', name: 'Капсула', give: 'goo', id: 'cap_p1', dlg: 'capsule' },
    { x: 31, y: 22, spr: 'capsule', name: 'Капсула', give: 'goo', id: 'cap_p2', dlg: 'capsule' },
    { x: 6, y: 6, spr: 'poster', name: 'Странный плакат', dlg: 'posterPortal' }
  ],
  items: [
    { t: 'goo', id: 'g_por1', x: 44, y: 6 },
    { t: 'goo', id: 'g_por2', x: 4, y: 30 }
  ],
  enemies: [
    { t: 'sphereling', x: 10, y: 8 }, { t: 'sphereling', x: 38, y: 28 },
    { t: 'sphereling', x: 8, y: 28 }, { t: 'sphereling', x: 38, y: 8 },
    { t: 'fog', x: 30, y: 30 }, { t: 'fogPurple', x: 10, y: 20 },
    { t: 'drone', x: 24, y: 30 }, { t: 'drone', x: 42, y: 18 }
  ]
};

/* ---- 6. ИЗМЕРЕНИЕ СОНИКА ---- */
RP.ZONES.sonic = {
  name: 'Измерение Соника',
  carve: 'p', spawn: { x: 24, y: 30 }, spheres: 20, dark: 0.3,
  tint: 'rgba(40,90,200,0.10)', music: 'dark',
  build: function () {
    var g = grid(48, 36, 'p');
    rectF(g, 0, 0, 48, 1, 'Z'); rectF(g, 0, 35, 48, 1, 'Z');
    rectF(g, 0, 0, 1, 36, 'Z'); rectF(g, 47, 0, 1, 36, 'Z');
    rectF(g, 14, 5, 20, 12, 'a');
    rectF(g, 20, 20, 8, 14, 'a');
    scat(g, 888, 'Z', 0.02, function (ch) { return ch === 'p'; });
    setG(g, 24, 35, 'D');
    return rows(g);
  },
  exits: [{ x: 24, y: 35, w: 1, h: 1, to: 'portal', sx: 24, sy: 17, label: 'Вернуться' }],
  npcs: [],
  props: [
    { x: 24, y: 31, spr: 'portal', name: 'Обратный портал', special: 'backPortal', dlg: 'portalBack' },
    { x: 15, y: 6, spr: 'poster', name: 'Плакат Соника', dlg: 'posterSonic' },
    { x: 33, y: 6, spr: 'tv', name: 'Экран', dlg: 'tvSonic' }
  ],
  items: [
    { t: 'photo', id: 'ph_son1', x: 4, y: 4 },
    { t: 'goo', id: 'g_son1', x: 44, y: 4 }
  ],
  enemies: [
    { t: 'sphereling', x: 10, y: 6 }, { t: 'sphereling', x: 38, y: 6 },
    { t: 'sphereling', x: 10, y: 30 }, { t: 'sphereling', x: 38, y: 30 },
    { t: 'droneRed', x: 8, y: 20 }, { t: 'droneRed', x: 40, y: 20 },
    { t: 'fogPurple', x: 24, y: 26 }, { t: 'droneRed', x: 24, y: 8 },
    { t: 'evil', x: 24, y: 10, boss: 'evil', hp: 60 }
  ]
};

/* ---- 7. СВАЛКА ВЕЛИКОВ ---- */
RP.ZONES.dump = {
  name: 'Свалка великов',
  carve: 'S', spawn: { x: 2, y: 16 }, spheres: 15, dark: 0.1, music: 'forest',
  build: function () {
    var g = grid(44, 32, 'S');
    rectF(g, 0, 0, 44, 1, 'X'); rectF(g, 0, 31, 44, 1, 'X');
    rectF(g, 0, 0, 1, 32, 'X'); rectF(g, 43, 0, 1, 32, 'X');
    rectF(g, 3, 3, 9, 6, 'z');
    rectF(g, 30, 20, 11, 7, 'z');
    rectF(g, 18, 5, 7, 4, 'z');
    scat(g, 444, 'z', 0.05, function (ch) { return ch === 'S'; });
    scat(g, 445, 'o', 0.03, function (ch) { return ch === 'S'; });
    setG(g, 0, 16, 'D');
    return rows(g);
  },
  exits: [{ x: 0, y: 16, w: 1, h: 1, to: 'street', sx: 7, sy: 46, label: 'В город' }],
  npcs: [
    { id: 'prof', x: 6, y: 27, spr: 'prof', name: 'Бомж-профессор', dlg: 'prof' }
  ],
  props: [
    { x: 9, y: 26, spr: 'poster', name: 'Диплом', special: 'diploma', id: 'dipl', dlg: 'diploma' },
    { x: 20, y: 6, spr: 'bikepile', name: 'Груда великов', dlg: 'bikepile' },
    { x: 24, y: 16, spr: 'bikepile', name: 'Груда великов', dlg: 'bikepile2' },
    { x: 40, y: 16, spr: 'safe', name: 'Странный сейф', dlg: 'safeDump' },
    { x: 4, y: 5, spr: 'cat', name: 'Свалочный кот', dlg: 'cat' },
    { x: 36, y: 29, spr: 'sign', name: 'Табличка', dlg: 'signDump' }
  ],
  items: [
    { t: 'bike', id: 'bike1', x: 36, y: 22 },
    { t: 'photo', id: 'ph_dump1', x: 40, y: 4 },
    { t: 'goo', id: 'g_dum1', x: 4, y: 14 },
    { t: 'goo', id: 'g_dum2', x: 40, y: 29 },
    { t: 'heart', id: 'h_dum1', x: 22, y: 30 }
  ],
  enemies: [
    { t: 'mutant', x: 20, y: 14 }, { t: 'mutant', x: 12, y: 24 },
    { t: 'mutant', x: 26, y: 28 }, { t: 'sphereling', x: 24, y: 10 },
    { t: 'fog', x: 38, y: 14 }, { t: 'drone', x: 18, y: 18 },
    { t: 'mutant', x: 34, y: 12 }
  ]
};

/* ---- 8. ФАБРИКА КРАСНЫХ СФЕР ---- */
RP.ZONES.factory = {
  name: 'Фабрика красных сфер',
  carve: 'f', spawn: { x: 27, y: 37 }, spheres: 30, dark: 0.45,
  tint: 'rgba(200,40,40,0.08)', music: 'factory',
  build: function () {
    var g = grid(56, 40, 'f');
    rectF(g, 0, 0, 56, 1, 'F'); rectF(g, 0, 39, 56, 1, 'F');
    rectF(g, 0, 0, 1, 40, 'F'); rectF(g, 55, 0, 1, 40, 'F');
    rectF(g, 3, 7, 50, 1, 'v');
    rectF(g, 3, 16, 50, 1, 'v');
    rectF(g, 3, 27, 50, 1, 'v');
    rectF(g, 3, 34, 50, 1, 'v');
    rectF(g, 8, 20, 6, 4, '~');
    rectF(g, 40, 11, 5, 3, '~');
    rectF(g, 24, 31, 7, 3, '~');
    rectF(g, 1, 10, 54, 1, 'F');
    setG(g, 27, 10, 'e'); setG(g, 28, 10, 'e');
    setG(g, 27, 39, 'D'); setG(g, 28, 39, 'D');
    setG(g, 27, 0, '0');
    scat(g, 333, 'o', 0.03, function (ch) { return ch === 'f'; });
    scat(g, 334, '1', 0.02, function (ch) { return ch === 'f'; });
    return rows(g);
  },
  exits: [{ x: 27, y: 39, w: 2, h: 1, to: 'street', sx: 53, sy: 40, label: 'Наружу' }],
  gates: [{
    x: 27, y: 10, w: 2, h: 1,
    open: function (G) { return !!G.flags.boss_drone && !!G.keys.key; },
    msg: 'Ворота запечатаны. Нужен СФЕРНЫЙ КЛЮЧ и разбитый Дрон-Мастер.'
  }],
  npcs: [],
  props: [
    { x: 27, y: 1, spr: 'monitor', name: 'Главный монитор', special: 'ending', dlg: 'finalMonitor' },
    { x: 4, y: 37, spr: 'capsule', name: 'Капсула', give: 'goo', id: 'cap_f1', dlg: 'capsule' },
    { x: 52, y: 37, spr: 'capsule', name: 'Капсула', give: 'goo', id: 'cap_f2', dlg: 'capsule' },
    { x: 30, y: 37, spr: 'sign', name: 'Табличка', dlg: 'signFactory' },
    { x: 5, y: 12, spr: 'board', name: 'Плакат охраны труда', dlg: 'boardFactory' },
    { x: 50, y: 25, spr: 'phone', name: 'Рабочий телефон', dlg: 'phone2' }
  ],
  items: [
    { t: 'goo', id: 'g_fac1', x: 5, y: 13 },
    { t: 'goo', id: 'g_fac2', x: 49, y: 25 },
    { t: 'goo', id: 'g_fac3', x: 30, y: 36 },
    { t: 'photo', id: 'ph_fac1', x: 51, y: 5 },
    { t: 'heart', id: 'h_fac1', x: 4, y: 5 }
  ],
  enemies: [
    { t: 'drone', x: 10, y: 14 }, { t: 'drone', x: 44, y: 14 },
    { t: 'drone', x: 12, y: 31 }, { t: 'drone', x: 42, y: 31 },
    { t: 'drone', x: 20, y: 23 }, { t: 'drone', x: 36, y: 23 },
    { t: 'droneRed', x: 6, y: 4 }, { t: 'droneRed', x: 48, y: 4 },
    { t: 'sphereling', x: 14, y: 5 }, { t: 'sphereling', x: 40, y: 5 },
    { t: 'mutant', x: 16, y: 36 }, { t: 'mutant', x: 38, y: 36 },
    { t: 'fogPurple', x: 8, y: 25 },
    { t: 'droneMaster', x: 27, y: 22, boss: 'drone', hp: 70 },
    { t: 'queen', x: 27, y: 5, boss: 'queen', hp: 100 }
  ]
};
