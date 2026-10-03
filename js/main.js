/* ============================================================
   РОМАН: ПИКСЕЛЬНОЕ ПРИКЛЮЧЕНИЕ — main.js
   Инициализация и главный цикл
   ============================================================ */
var RP = (typeof window !== 'undefined')
  ? (window.RP = window.RP || {})
  : (globalThis.RP = globalThis.RP || {});

var lastT = 0;

function isFsLayout() {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    var sw = screen.availWidth || 0, sh = screen.availHeight || 0;
    if (sw && sh && window.innerWidth >= sw - 2 && window.innerHeight >= sh - 2) return true;
  } catch (e) { }
  return false;
}

function resizeScreen() {
  if (!canvas) return;
  var fs = isFsLayout();
  if (document.body && document.body.classList) document.body.classList.toggle('fs', fs);
  var crt = document.getElementById('crt');
  if (fs) {
    var aw = window.innerWidth, ah = window.innerHeight;
    var fsc = Math.min(aw / VW, ah / VH);
    if (fsc < 1) fsc = 1;
    canvas.style.width = Math.floor(VW * fsc) + 'px';
    canvas.style.height = Math.floor(VH * fsc) + 'px';
    if (crt && crt.style) crt.style.backgroundSize = '100% ' + Math.max(3, Math.round(fsc * 3)) + 'px';
    return;
  }
  var hint = document.getElementById('hint');
  var hintH = hint ? hint.offsetHeight + 16 : 46;
  var w = window.innerWidth - 24;
  var h = window.innerHeight - hintH - 24;
  var scale = Math.floor(Math.min(w / VW, h / VH));
  if (scale < 1) scale = 1;
  if (scale > 6) scale = 6;
  canvas.style.width = (VW * scale) + 'px';
  canvas.style.height = (VH * scale) + 'px';
  if (crt && crt.style) crt.style.backgroundSize = '100% ' + (scale * 3) + 'px';
}

/* ---------- роутинг ввода по состояниям ---------- */
function tickTitle() {
  if (typeof NET !== 'undefined' && NET.status === 'error' && (anyHit(K_ACT) || anyHit(K_PAUSE))) {
    NET.leave();
    return;
  }
  if (typeof NET !== 'undefined' && NET.mode === 'client') {
    if (anyHit(K_PAUSE)) { NET.leave(); return; }
    if (anyHit(K_MUTE)) musicOn = !musicOn;
    return;
  }
  if (anyHit(K_UP)) { titleSel = (titleSel + 2) % 3; sfx('blip'); }
  if (anyHit(K_DOWN)) { titleSel = (titleSel + 1) % 3; sfx('blip'); }
  if (anyHit(K_MUTE)) { musicOn = !musicOn; }
  if (anyHit(K_ACT)) {
    if (titleSel === 0) { newGame(); sfx('key'); }
    else if (titleSel === 1) { if (saveExists) { continueGame(); sfx('key'); } else sfx('err'); }
    else { controlsFrom = 'title'; state = 'controls'; sfx('blip'); }
  }
}
function tickControls() {
  if (anyHit(K_ACT) || anyHit(K_PAUSE)) {
    state = controlsFrom === 'pause' ? 'pause' : 'title';
    sfx('blip');
  }
  if (anyHit(K_MUTE)) musicOn = !musicOn;
}
function tickQuests() {
  if (anyHit(K_QUEST) || anyHit(K_PAUSE) || anyHit(K_ACT)) { state = 'play'; sfx('blip'); }
  if (anyHit(K_MUTE)) musicOn = !musicOn;
}
function tickPause() {
  if (anyHit(K_UP)) { pauseSel = (pauseSel + 3) % 4; sfx('blip'); }
  if (anyHit(K_DOWN)) { pauseSel = (pauseSel + 1) % 4; sfx('blip'); }
  if (anyHit(K_PAUSE)) { state = 'play'; sfx('blip'); return; }
  if (anyHit(K_MUTE)) musicOn = !musicOn;
  if (anyHit(K_ACT)) {
    sfx('blip');
    if (pauseSel === 0) state = 'play';
    else if (pauseSel === 1) { saveGame(); toast('Сохранено!'); }
    else if (pauseSel === 2) { controlsFrom = 'pause'; state = 'controls'; }
    else { saveGame(); state = 'title'; setMusicTheme('title'); }
  }
}
function tickGameover() {
  if (anyHit(K_ACT)) {
    if (typeof NET !== 'undefined' && NET.mode === 'client') NET.sendCmd('respawn');
    else respawn();
  }
}
function tickFade(dt) {
  fade.a += fade.dir * dt * 3.2;
  if (fade.dir === 1 && fade.a >= 1) {
    fade.a = 1;
    loadZone(fade.to, fade.sx, fade.sy);
    fade.dir = -1;
    saveGame();
  } else if (fade.dir === -1 && fade.a <= 0) {
    fade.a = 0;
    state = 'play';
  }
}
function tickEnding(dt) {
  if (state === 'credits') {
    creditsY -= dt * 24;
    var endY = creditsY + RP.CREDITS.length * 13;
    if (endY < 30 && anyHit(K_ACT)) {
      state = 'title';
      titleSel = 0;
      setMusicTheme('title');
      sfx('blip');
    }
    return;
  }
  if (anyHit(K_MUTE)) musicOn = !musicOn;
  if (anyHit(K_ACT)) {
    if (!ending.phrase) {
      ending.page++;
      sfx('blip');
      if (ending.page >= RP.STORY.length) { ending.phrase = true; sfx('key'); }
    } else {
      state = 'credits';
      creditsY = VH + 10;
      sfx('key');
    }
  }
}

/* ---------- тик ---------- */
function tick(dt) {
  if (typeof NET !== 'undefined' && NET.tick) NET.tick(dt);
  switch (state) {
    case 'title': tickTitle(); break;
    case 'controls': tickControls(); break;
    case 'play':
      if (typeof NET !== 'undefined' && NET.mode === 'client') NET.updateClient(dt);
      else updatePlay(dt);
      break;
    case 'dialog': updateDialog(dt); break;
    case 'quests': tickQuests(); break;
    case 'pause': tickPause(); break;
    case 'gameover': tickGameover(); break;
    case 'fade': tickFade(dt); break;
    case 'ending':
    case 'credits': tickEnding(dt); break;
  }
  musicTick();
}

/* ---------- цикл ---------- */
function loop(ts) {
  if (!lastT) lastT = ts;
  var dt = (ts - lastT) / 1000;
  lastT = ts;
  if (dt > 0.05) dt = 0.05;
  if (dt < 0) dt = 0;
  time += dt;
  try {
    tick(dt);
    render();
  } catch (err) {
    if (typeof console !== 'undefined') console.error(err);
    try {
      if (ctx) {
        ctx.fillStyle = '#100';
        ctx.fillRect(0, 0, VW, VH);
        textShadow('Ошибка: ' + (err && err.message ? err.message : err), 8, 8, '#ff6a6a');
      }
    } catch (e2) { }
  }
  hit = {};
  requestAnimationFrame(loop);
}

/* ---------- загрузка ---------- */
function boot() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  uiCanvas = document.getElementById('ui');
  uictx = (uiCanvas && uiCanvas.getContext) ? uiCanvas.getContext('2d') : null;
  if (uictx) uictx.imageSmoothingEnabled = true;
  if (RP.buildSprites) RP.buildSprites();
  if (!RP.TILES && RP.buildTiles) RP.buildTiles();
  initInput();
  saveExists = !!readSave();
  resizeScreen();
  window.addEventListener('resize', resizeScreen);
  document.addEventListener('fullscreenchange', resizeScreen);
  document.addEventListener('webkitfullscreenchange', resizeScreen);
  canvas.addEventListener('dblclick', function () {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch (e) { }
  });
  canvas.addEventListener('click', function (e) {
    if (typeof NET !== 'undefined' && NET.mode === 'host' && NET.code && state === 'play') {
      var rect = canvas.getBoundingClientRect();
      var y = e.clientY - rect.top;
      if (y > rect.height * 0.78) {
        var link = location.origin + location.pathname.replace(/game\.html.*$/, 'game.html') + '?join=' + NET.code;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(function () {
            toast('Ссылка на комнату скопирована!');
          }).catch(function () {
            toast('Код: ' + NET.code);
          });
        } else {
          toast('Код: ' + NET.code);
        }
      }
    }
  });
  if (typeof NET !== 'undefined' && NET.boot) {
    NET.boot();
    if (NET.mode === 'host' && !G) {
      if (saveExists) continueGame();
      else newGame();
    }
  }
  setMusicTheme('title');
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', boot);
else boot();
