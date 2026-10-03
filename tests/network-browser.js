/* Run with: python -m http.server 8765 --bind 127.0.0.1
 * Open http://127.0.0.1:8765/tests/network.html in a WebRTC-capable browser.
 * Real RTC channels are used even when signaling/broker failures are simulated.
 */
(async function () {
  var frames = [], errors = [], relay = [], signalTypes = [], relayPackets = [];
  var results = document.getElementById('results');
  function report(name, ok, detail) {
    var li = document.createElement('li'); li.className = ok ? 'ok' : 'bad';
    li.textContent = (ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''); results.appendChild(li);
    if (!ok) throw Error(name + ': ' + (detail || 'assertion failed'));
  }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  async function until(fn, ms) {
    var end = performance.now() + (ms || 10000);
    while (performance.now() < end) { if (fn()) return; await sleep(50); }
    throw Error('timeout: ' + fn.toString() + ' ' + frames.map(function (f) {
      var n = f.contentWindow.NET;
      return n ? [n.mode, n.status, f.contentWindow.state, n.statusText, n.signalStatus, 'guests=' + n.countGuests(), 'brokers=' + n.brokers.map(function (b) { return b.ready + ':' + b.error; }).join(','), JSON.stringify(f.contentWindow.__signals), 'peers=' + Object.values(n.peers).map(function (c) { return [c.pc.connectionState,c.pc.signalingState,!!c.pc.remoteDescription,c.transport,!!c.aes,c.relayWanted,c.sid].join('/'); }).join(','), 'queues=' + Object.values(f.contentWindow.remotePlayers).map(function (p) { return p.id + ':' + p.cmds.join(','); }).join('/')].join(' / ') : 'unloaded';
    }).join(' | ') + ' sockets=' + JSON.stringify(frames.map(function(f){return f.contentWindow.wsMetrics;})));
  }
  var gameHTML = await (await fetch('../game.html')).text();
  var baseURL = new URL('../', location.href).href;
  // Absolute asset URLs also keep the browser's speculative preloader on the
  // correct path while it parses srcdoc (before applying the base element).
  gameHTML = gameHTML.replace(/(src|href)="((?:js|css)\/[^\"]+)"/g, function (_, attr, path) {
    if (path.indexOf('js/network.js') === 0) path += (path.indexOf('?') >= 0 ? '&' : '?') + 'test=' + Date.now();
    return attr + '="' + baseURL + path + '"';
  });
  // This relay simulates two independent brokers, not game transport.
  window.mockPaho = function () {
    function Client(url) { this.url = url; this.ready = false; relay.push(this); }
    Client.prototype.connect = function (o) {
      var c = this;
      setTimeout(function () {
        if (c.url.indexOf('emqx') >= 0 && !window.primaryAvailable) o.onFailure({ errorMessage: 'simulated primary outage' });
        else { c.ready = true; o.onSuccess(); }
      }, 10);
    };
    Client.prototype.subscribe = function (topic, o) { this.topic = topic; setTimeout(o.onSuccess, 0); };
    Client.prototype.disconnect = function () { this.ready = false; };
    Client.prototype.send = function (m) {
      var sender = this;
      if (m.qos === 1) setTimeout(function () { if (sender.ready && sender.onMessageDelivered) sender.onMessageDelivered(m); }, 10);
      var data = JSON.parse(m.payloadString), kind = data.type;
      if (kind === 'part' && data.body.n === 0) {
        var match = atob(data.body.data).match(/"type":"([a-z-]+)"/);
        if (match) kind = match[1];
      }
      signalTypes.push(kind);
      if (data.type === 'relay') {
        relayPackets.push(data);
        if (window.dropRelayFrom === data.from) { window.dropRelayFrom = null; return; }
      }
      if (window.dropNextAnswer && kind === 'answer') {
        window.dropNextAnswer = false; throw Error('simulated publish failure');
      }
      var delay = kind === 'offer' ? 120 : 0; // ICE before SDP, including parts.
      relay.forEach(function (c) {
        if (!c.ready || c.url !== this.url || c.topic !== m.destinationName) return;
        [delay, delay + 5].forEach(function (d) {
          setTimeout(function () { if (c.ready) c.onMessageArrived(m); }, d);
        }); // Duplicate all packets like overlapping transports / QoS 1.
      }, this);
    };
    function Message(payload) { this.payloadString = payload; this.retained = false; }
    return { MQTT: { Client: Client, Message: Message } };
  };
  async function frame(kind, code, transport) {
    var f = document.createElement('iframe'); frames.push(f);
    var prelude = "window.addEventListener('error',function(e){parent.testError(e.message)});";
    if (transport.indexOf('online') === 0) prelude += "window.wsMetrics={sent:{},received:{}};var NativeWS=window.WebSocket;window.WebSocket=function(url,p){var ws=new NativeWS(url,p),send=ws.send;ws.send=function(data){var k=data.byteLength;wsMetrics.sent[k]=(wsMetrics.sent[k]||0)+1;return send.call(ws,data)};ws.addEventListener('message',function(e){var k=e.data.byteLength;wsMetrics.received[k]=(wsMetrics.received[k]||0)+1});return ws};";
    if (transport === 'offline') prelude += "window.WebSocket=function(){throw Error('network intentionally blocked')};";
    if (transport !== 'offline') prelude += "window.BroadcastChannel=undefined;";
    if (transport.indexOf('blocked') >= 0) prelude += "var NativeRTC=window.RTCPeerConnection;window.RTCPeerConnection=function(){return new NativeRTC({iceServers:[],iceTransportPolicy:'relay'})};";
    var html = gameHTML.replace('<head>', '<head><base href="' + baseURL + '"><script>' + prelude + '<\/script>');
    if (transport.indexOf('mock') === 0) html = html.replace(/<script src="([^"]*js\/network.js[^\"]*)">/, '<script>window.Paho=parent.mockPaho();<\/script><script src="$1">');
    f.srcdoc = html;
    document.getElementById('frames').appendChild(f);
    await until(function () { return f.contentWindow.NET && f.contentWindow.canvas; });
    var w = f.contentWindow;
    w.__signals = { in: {}, out: {}, raw: {} };
    var receive = w.NET.receiveSignal, signal = w.NET.signal, connect = w.NET.connectBroker;
    w.NET.connectBroker = function (index) {
      connect(index);
      var b = w.NET.brokers[index];
      if (!b || !b.client) return;
      var handler = b.client.onMessageArrived;
      b.client.onMessageArrived = function (m) {
        var key;
        try { key = index + ':' + JSON.parse(m.payloadString).type + ':retained=' + m.retained; }
        catch (e) { key = index + ':bad-json'; }
        w.__signals.raw[key] = (w.__signals.raw[key] || 0) + 1;
        handler(m);
      };
    };
    w.NET.receiveSignal = function (m, route) {
      w.__signals.in[m.type] = (w.__signals.in[m.type] || 0) + 1; return receive(m, route);
    };
    w.NET.signal = function (type, to, body, c) {
      w.__signals.out[type] = (w.__signals.out[type] || 0) + 1; return signal(type, to, body, c);
    };
    if (kind === 'host') w.saveExists = false;
    if (kind === 'host') w.NET.startHost(code); else if (kind === 'client') w.NET.startClient(code);
    return w;
  }
  window.testError = function (msg) { errors.push(msg); };
  function cleanup() {
    frames.forEach(function (f) { if (f.contentWindow.NET) f.contentWindow.NET.cleanup(); f.remove(); });
    frames = []; relay = []; signalTypes = []; relayPackets = [];
  }
  // Focused regression: ICE has no candidates, so MQTT must carry the game.
  if (new URLSearchParams(location.search).has('quick')) {
    try {
      var localHost = await frame('host', 'LOCAL2', 'offline');
      var localGuest = await frame('client', 'LOCAL2', 'offline');
      await until(function () { return localGuest.NET.status === 'open'; });
      report('Локальный WebRTC по-прежнему работает оффлайн', localGuest.NET.conn.transport === 'rtc');
      cleanup(); window.primaryAvailable = true;
      var transport = new URLSearchParams(location.search).has('public') ? 'online-blocked' : 'mock-blocked';
      var h = await frame('host', 'R' + Math.random().toString(36).slice(2, 7).toUpperCase(), transport);
      var g = await frame('client', h.NET.code, transport);
      await until(function () { return g.NET.status === 'open'; }, 30000);
      report('Вход без единого ICE-кандидата через резервный канал', g.NET.conn.transport === 'mqtt' && h.NET.countGuests() === 1);
      report('Гость получил мир и перешёл в игру', g.G && g.zone.id === h.zone.id && g.state === 'play');
      report('WebRTC закрыт, резервный канал зашифрован AES-GCM', g.NET.conn.pc.connectionState === 'closed' && g.NET.conn.aes.algorithm.name === 'AES-GCM');
      if (transport === 'mock-blocked') report('В публичные сообщения не попадает открытый снапшот', relayPackets.length > 0 && relayPackets.every(function (p) { return !p.body.G && typeof p.body.data === 'string'; }));
      var gid = g.NET.myId, executed = [], original = h.playerAttack;
      h.playerAttack = function (p) { if (p.id === gid) executed.push('atk'); original(p); };
      // Drop exactly this command, without competing movement heartbeats.
      g.NET.tick = function () {};
      window.dropRelayFrom = g.NET.session;
      report('Команда принята резервным транспортом', g.NET.send({ t: 'cmd', k: 'atk' }));
      await until(function () { return executed.length >= 1; }, transport === 'mock-blocked' ? 5000 : 14000);
      await sleep(1200);
      report('Потерянная команда повторяется и выполняется один раз', executed.length === 1);
      await until(function () { return g.NET.conn.pending.size === 0; }, transport === 'mock-blocked' ? 5000 : 14000);
      report('Подтверждённые команды удалены из очереди', g.NET.conn.pending.size === 0);
      var seq = g.NET.lastSnap;
      await until(function () { return g.NET.lastSnap > seq; });
      report('Игровые снапшоты продолжают приходить через MQTT', g.NET.lastSnap > seq);
      g.NET.conn.relayStarted = g.NET.now() - 21; g.NET.serviceRelay();
      report('Установленный резервный канал не обрывается по таймеру согласования', g.NET.status === 'open');
      g.NET.conn.lastHeard = g.NET.now() - 16; g.NET.serviceRelay();
      report('Потеря хоста завершает соединение и освобождает ресурсы', g.NET.status === 'error' && g.NET.conn === null);
      report('Ошибок JavaScript нет', errors.length === 0, errors.join(', '));
      document.getElementById('status').textContent = 'Проверки блокировки WebRTC пройдены.';
    } catch (e) { document.getElementById('status').textContent = 'ОШИБКА: ' + e.message; }
    finally { cleanup(); }
    return;
  }
  try {
    var host = await frame('host', 'LOC123', 'offline');
    report('Хост немедленно запускает мир', host.G && host.zone && host.state === 'play' && host.NET.status === 'open');
    var guests = [];
    for (var i = 0; i < 4; i++) {
      guests.push(await frame('client', 'LOC123', 'offline'));
      await until(function () { return guests[guests.length - 1].NET.status === 'open'; });
    }
    var guest = guests[0];
    await until(function () { return host.NET.countGuests() === 4 && guests.every(function (w) { return w.state === 'play'; }); });
    report('Четыре гостя подключились оффлайн через настоящие RTCDataChannels', host.NET.countGuests() === 4);
    report('Локальный WebRTC не требует STUN/MQTT', guest.NET.conn.local && guest.NET.conn.pc.getConfiguration().iceServers.length === 0 && guest.NET.brokers.length === 0);
    report('Команды надёжны, снапшоты не ждут ретрансляции', guest.NET.conn.dc.ordered && !guest.NET.conn.fast.ordered && guest.NET.conn.fast.maxRetransmits === 0);
    var extra = await frame('client', 'LOC123', 'offline');
    await until(function () { return extra.NET.status === 'error'; });
    report('Шестой игрок получает отказ', extra.NET.err.indexOf('полна') >= 0 && host.NET.countGuests() === 4);
    var id = guest.NET.myId;
    guest.NET.cleanup();
    await until(function () { return host.NET.countGuests() === 3; });
    guest.NET.startClient('LOC123');
    await until(function () { return guest.NET.status === 'open'; });
    report('После выхода ID и слот переиспользуются', host.NET.countGuests() === 4 && guest.NET.myId === id);
    var attacks = 0, originalAttack = host.playerAttack;
    host.playerAttack = function (p) { if (p.id === id) attacks++; originalAttack(p); };
    report('Гость готов передавать надёжные команды', guest.NET.send({ t: 'cmd', k: 'atk' }));
    await until(function () { return attacks >= 1; });
    report('Команда гостя исполняется только хостом', attacks === 1);
    var c = host.NET.conns[id];
    host.NET.hostMsg(c, { t: 'mv', seq: 10000, r: true });
    host.NET.hostMsg(c, { t: 'mv', seq: 9999, r: false });
    report('Запоздалый ввод не перезаписывает новый', host.remotePlayers[id].input.r);
    c.lastInput = host.NET.now() - 1; host.NET.tick(0);
    report('Потерянное отпускание клавиши не оставляет движение', !host.remotePlayers[id].input.r);
    var snap = JSON.parse(JSON.stringify(host.NET.buildSnap()));
    var remote = guest.remotePlayers[0], prevX = remote.x;
    snap.ps[0].x = prevX + 120;
    guest.NET.applySnap(snap, false);
    report('Большой сдвиг удалённого игрока меняет цель без телепортации', remote.x === prevX && remote.targetX === prevX + 120);
    guest.NET.smoothClient(0.01);
    report('Покадровый Lerp приближает фигуру к цели', remote.x > prevX && remote.x < remote.targetX);
    var seq = guest.NET.lastSnap;
    var oldG = guest.G;
    guest.NET.applySnap(snap, false);
    report('Дубликат/старый снапшот отбрасывается', guest.NET.lastSnap === seq && guest.G === oldG);
    host.spawnEnemy({ t: 'mutant', px: 160, py: 100, uid: 10001 });
    await until(function () { return guest.zone.enemies.some(function (e) { return e.uid === 10001; }); });
    var enemy = guest.zone.enemies.find(function (e) { return e.uid === 10001; });
    var oldEX = enemy.x;
    snap = JSON.parse(JSON.stringify(host.NET.buildSnap()));
    snap.en.find(function (e) { return e.u === 10001; }).x = oldEX + 100;
    guest.NET.applySnap(snap, false);
    report('Враги также получают целевую позицию без рывка', enemy.x === oldEX && enemy.targetX === oldEX + 100);
    var epoch = guest.NET.lastEpoch;
    host.loadZone('home', host.RP.ZONES.home.spawn.x, host.RP.ZONES.home.spawn.y);
    await until(function () { return guest.NET.lastEpoch > epoch; });
    report('Повторная загрузка той же зоны сбрасывает позиции/UID', guest.zone.id === host.zone.id && guest.zone.enemies.length === host.zone.enemies.length);
    cleanup();
    window.dropNextAnswer = true;
    host = await frame('host', 'MQT123', 'mock');
    guest = await frame('client', 'MQT123', 'mock');
    await until(function () { return guest.NET.status === 'open'; }, 16000);
    report('Резервный MQTT работает при отказе основного, дубликатах и ICE до SDP', host.NET.countGuests() === 1 && !guest.NET.conn.local && signalTypes.includes('answer'));
    report('Сбой публикации Paho запускает восстановление', !window.dropNextAnswer);
    report('MQTT передаёт только сигналинг при рабочем P2P', signalTypes.every(function (t) { return ['join', 'offer', 'answer', 'ice', 'reject', 'part'].includes(t); }));
    report('Интернет-гость сохраняет сигналинг для аварийного переключения', guest.NET.signalsActive && guest.NET.brokers.some(function (b) { return b.ready; }));
    host.NET.cleanup();
    await until(function () { return guest.NET.status === 'error'; }, 30000);
    report('Отключение хоста освобождает ресурсы и показывает ошибку', guest.NET.conn === null && guest.state === 'title');
    cleanup(); window.primaryAvailable = true;
    host = await frame('host', 'FAST12', 'mock');
    guest = await frame('client', 'FAST12', 'mock');
    await until(function () { return guest.NET.status === 'open'; });
    await sleep(1600);
    report('Сигналинг остаётся готов к аварийному переключению', guest.NET.signalsActive && guest.NET.brokers.length > 0);
    window.primaryAvailable = false;
    report('Игровых ошибок JavaScript нет', errors.length === 0, errors.join(', '));
    document.getElementById('status').textContent = 'Все обязательные проверки пройдены.';
    cleanup();
  } catch (e) {
    document.getElementById('status').textContent = 'ОШИБКА: ' + e.message;
    console.error(e);
  }
  document.getElementById('online').disabled = false;
  document.getElementById('online').onclick = async function () {
    document.getElementById('online').disabled = true;
    cleanup();
    document.getElementById('status').textContent = 'Проверка реальных публичных WSS-брокеров…';
    try {
      var host = await frame('host', 'T' + Math.random().toString(36).slice(2, 7).toUpperCase(), 'online');
      var guest = await frame('client', host.NET.code, 'online');
      var diagnostic = document.createElement('p'); results.appendChild(diagnostic);
      var debugTimer = setInterval(function () {
        diagnostic.textContent = [host, guest].map(function (w) {
          return w.NET.mode + ': brokers=' + w.NET.brokers.map(function (b) { return b.ready + (b.error ? '(' + b.error + ')' : ''); }).join(',') +
            ', signal=' + JSON.stringify(w.__signals) + ', peers=' + Object.values(w.NET.peers).map(function (c) {
              return [c.pc.connectionState, c.pc.iceConnectionState, c.pc.signalingState, !!c.pc.remoteDescription, c.ice.length].join('/');
            }).join(',');
        }).join(' | ');
      }, 500);
      await until(function () { return guest.NET.status === 'open' || guest.NET.status === 'error'; }, 32000);
      clearInterval(debugTimer);
      report('Реальный MQTT → WebRTC', guest.NET.status === 'open', guest.NET.err || host.NET.brokers.map(function (b, i) { return host.NET.brokerURLs[i] + '=' + b.ready; }).join(', '));
      diagnostic.remove();
      document.getElementById('status').textContent = 'Публичный сигналинг и прямой WebRTC работают в этой сети.';
    } catch (e) { document.getElementById('status').textContent = 'Публичный сигналинг: ' + e.message; }
    finally { if (debugTimer) clearInterval(debugTimer); cleanup(); document.getElementById('online').disabled = false; }
  };
})();
