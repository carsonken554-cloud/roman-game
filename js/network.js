/* Native WebRTC, host-authoritative co-op (one host + four guests).
 * BroadcastChannel handles same-origin tabs without any server. MQTT carries
 * discovery/SDP/ICE, with an encrypted MQTT fallback when direct ICE fails.
 * Optional TURN: set RP.NET_ICE before loading this file (never embed secrets).
 */
var RP = (typeof window !== 'undefined')
  ? (window.RP = window.RP || {}) : (globalThis.RP = globalThis.RP || {});
var NET_ICE = RP.NET_ICE || [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' }
];
var NET_AL = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var NET = RP.NET = {
  mode: 'solo', status: '', statusText: '', code: '', err: '',
  conn: null, conns: {}, peers: {}, myId: 0, nextId: 1,
  snapT: 0, mvT: 0, hiT: 0, lastMv: '', inputSeq: 0,
  snapSeq: 0, lastSnap: -1, zoneEpoch: 0, lastEpoch: -1,
  dlgCb: {}, remoteDlg: null, pendingGuests: [], rate: {},
  ended: false, hardSnap: false, overPrev: false, selfTarget: null,
  watchdogTimer: null, keepaliveTimer: null, timers: [],
  bc: null, brokers: [], signalsActive: false, seen: new Map(), earlyICE: new Map(), fragments: new Map(),
  generation: 0, session: '', signalSeq: 0, ping: null,
  signalStatus: '',
  brokerURLs: ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt']
};
NET.now = function () { return performance.now() / 1000; };
NET.token = function () {
  var a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, function (v) { return v.toString(16).padStart(2, '0'); }).join('');
};
NET.normCode = function (s) {
  return String(s || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '').slice(0, 6);
};
NET.genCode = function () {
  var a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, function (v) { return NET_AL[v % NET_AL.length]; }).join('');
};
NET.later = function (fn, ms) {
  var gen = NET.generation;
  var t = setTimeout(function () {
    var i = NET.timers.indexOf(t);
    if (i >= 0) NET.timers.splice(i, 1);
    if (gen === NET.generation) fn();
  }, ms);
  NET.timers.push(t);
  return t;
};
NET.sendTo = function (conn, obj) {
  if (!conn || conn.closed) return false;
  if (conn.transport === 'mqtt') return NET.relaySend(conn, obj);
  var transient = obj.t === 's' || obj.t === 'mv';
  var dc = transient ? conn.fast : conn.dc;
  if (!dc || dc.readyState !== 'open') return false;
  // Drop replaceable packets instead of building a queue of old world states.
  if (dc.bufferedAmount > (transient ? 65536 : 262144)) {
    if (!transient) NET.connectionError(conn, 'Соединение перегружено.');
    return false;
  }
  try {
    var data = JSON.stringify(obj);
    var limit = conn.pc.sctp && conn.pc.sctp.maxMessageSize;
    var bytes = new TextEncoder().encode(data).length;
    if (bytes > Math.min(limit || 60000, 60000)) {
      NET.connectionError(conn, 'Сетевой пакет слишком большой.');
      return false;
    }
    dc.send(data);
    return true;
  } catch (e) { return false; }
};
NET.send = function (obj) { return NET.sendTo(NET.conn, obj); };
NET.sendCmd = function (k) {
  if (NET.mode === 'client' && NET.status === 'open') NET.send({ t: 'cmd', k: k });
};
NET.countGuests = function () { return Object.keys(NET.conns).length; };
NET.updStatus = function () {
  if (NET.mode !== 'host' || NET.status === 'error') return;
  var n = NET.countGuests() + 1;
  NET.statusText = 'КОМНАТА ' + NET.code + (n > 1 ? ' · ИГРОКОВ: ' + n : ' · ЖДЁМ ДРУЗЕЙ…');
};
NET.closeSignals = function () {
  NET.signalsActive = false;
  if (NET.bc) { NET.bc.close(); NET.bc = null; }
  NET.brokers.forEach(function (b) {
    b.ready = false;
    if (b.client) {
      b.client.onConnectionLost = function () {};
      b.client.onMessageArrived = function () {};
      try { b.client.disconnect(); } catch (e) { }
    }
  });
  NET.brokers = [];
};
NET.cleanup = function () {
  NET.generation++;
  NET.timers.forEach(clearTimeout); NET.timers = [];
  clearTimeout(NET.watchdogTimer); NET.watchdogTimer = null;
  clearInterval(NET.keepaliveTimer); NET.keepaliveTimer = null;
  clearInterval(NET.relayServiceTimer); NET.relayServiceTimer = null;
  NET.closeSignals();
  Object.keys(NET.peers).forEach(function (k) { NET.closeConn(NET.peers[k]); });
  NET.peers = {}; NET.conns = {}; NET.conn = null;
  NET.pendingGuests = []; NET.dlgCb = {}; NET.rate = {};
  NET.remoteDlg = null; NET.selfTarget = null;
  NET.seen.clear(); NET.earlyICE.clear(); NET.fragments.clear();
  if (typeof remotePlayers !== 'undefined') remotePlayers = {};
};
NET.fail = function (msg) {
  NET.cleanup();
  NET.status = 'error'; NET.err = msg || 'Ошибка сети'; NET.statusText = NET.err;
  if (typeof state !== 'undefined') state = 'title';
};
NET.leave = function () {
  var err = NET.err;
  NET.cleanup(); NET.mode = 'solo'; NET.status = ''; NET.code = '';
  if (typeof location !== 'undefined') location.href = 'index.html' + (err ? '?err=' + encodeURIComponent(err) : '');
};
NET.boot = function () {
  if (NET.mode !== 'solo') return;
  var q = new URLSearchParams(window.location.search);
  if (q.has('host')) NET.startHost(q.get('host'));
  else if (q.has('join')) NET.startClient(q.get('join'));
};
NET.start = function (mode, code) {
  NET.cleanup(); NET.mode = mode; NET.code = NET.normCode(code);
  NET.err = ''; NET.status = 'connecting';
  NET.statusText = 'ПОДКЛЮЧЕНИЕ К КОМНАТЕ ' + NET.code + '…';
  NET.myId = 0; NET.nextId = 1; NET.snapSeq = 0; NET.lastSnap = -1;
  NET.zoneEpoch = 0; NET.lastEpoch = -1; NET.inputSeq = 0;
  NET.snapT = NET.mvT = 0; NET.lastMv = ''; NET.ping = null;
  NET.ended = NET.overPrev = NET.hardSnap = false;
  if (!/^[A-Z0-9]{6}$/.test(NET.code)) { NET.fail('Введите код комнаты из 6 символов.'); return false; }
  if (typeof RTCPeerConnection === 'undefined') { NET.fail('Этот браузер не поддерживает WebRTC.'); return false; }
  NET.session = NET.token(); NET.signalSeq = 0;
  return true;
};
NET.startHost = function (code) {
  if (!NET.start('host', code || NET.genCode())) return;
  // main.boot invokes this after sprites, input and saves have been initialized.
  try {
    if (!G || !zone) {
      if (typeof saveExists !== 'undefined' && saveExists) continueGame();
      else newGame();
    }
    if (state === 'title') state = 'play';
    NET.openSignals(); NET.status = 'open'; NET.updStatus();
  } catch (e) { NET.fail('Не удалось запустить комнату: ' + e.message); }
};
NET.startClient = function (code) {
  if (!NET.start('client', code)) return;
  state = 'title';
  NET.watchdogTimer = NET.later(function () {
    if (NET.status !== 'open') NET.fail('Не удалось подключиться к ' + NET.code + '. Проверьте код, открыта ли игра у хоста и доступность MQTT-брокеров.');
  }, 30000);
  NET.openSignals();
};

/* Signaling: subscribe before publishing; use both brokers so asymmetric
 * reachability cannot strand host and guest on different fallback servers.
 * Primary starts first, backup shortly afterwards. Repeated discovery resends
 * descriptions (including gathered candidates); unique mids deduplicate paths.
 */
NET.signal = function (type, to, body, conn) {
  var m = { v: 1, room: NET.code, from: NET.session, to: to || '*',
    mid: NET.session + ':' + (++NET.signalSeq), type: type, body: body || {} };
  if (NET.bc && type !== 'relay') { try { NET.bc.postMessage(m); } catch (e) { } }
  if (conn && conn.local) return;
  return NET.publish(m);
};
NET.publish = function (m) {
  var payload = JSON.stringify(m);
  var packets = [payload];
  if (new TextEncoder().encode(payload).length > 1000) {
    var encoded = NET.b64(new TextEncoder().encode(payload)), total = Math.ceil(encoded.length / 700);
    packets = [];
    for (var i = 0; i < total; i++) packets.push(JSON.stringify({ v: 1, room: m.room, from: m.from, to: m.to,
      mid: m.mid + '.' + i, type: 'part', body: { id: m.mid, n: i, total: total, data: encoded.slice(i * 700, (i + 1) * 700) } }));
  }
  var sent = false;
  var relay = m.type === 'relay', statePacket = relay && m.body.state;
  NET.brokers.forEach(function (b) {
    if (!b.ready) return;
    if (relay && (statePacket ? b.statePending > 0 : b.controlPending >= 32)) return;
    try {
      packets.forEach(function (packet) {
        var msg = new Paho.MQTT.Message(packet);
        msg.destinationName = NET.topic; msg.qos = relay ? 1 : 0; msg.retained = false;
        if (relay) {
          msg._rpxState = !!statePacket;
          if (statePacket) b.statePending++; else b.controlPending++;
        }
        b.client.send(msg);
      }); sent = true;
    } catch (e) { if (b.retry) b.retry(e); }
  });
  return sent;
};
NET.discover = function () {
  if (NET.mode === 'client' && NET.status === 'connecting' && !(NET.conn && NET.conn.open)) {
    NET.signal('join', '*');
    if (NET.conn) NET.describe(NET.conn);
  }
};
NET.openSignals = function () {
  NET.signalsActive = true;
  NET.topic = 'rpx/v1/room/' + NET.code;
  NET.signalStatus = 'local';
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      NET.bc = new BroadcastChannel('rpx_sig_' + NET.code);
      NET.bc.onmessage = function (e) { NET.receiveSignal(e.data, 'local'); };
    } catch (e) { NET.bc = null; }
  }
  NET.discover();
  NET.keepaliveTimer = setInterval(NET.discover, 1500);
  NET.relayServiceTimer = setInterval(NET.serviceRelay, 500);
  // Give same-browser tabs first chance: no STUN dependency on the local path.
  NET.later(function () {
    if (NET.mode === 'client' && NET.conn && NET.conn.local) return;
    NET.connectBroker(0);
  }, 350);
  NET.later(function () {
    if (NET.mode === 'client' && NET.conn && NET.conn.local) return;
    NET.connectBroker(1);
  }, 1100);
  NET.later(function () {
    if (NET.mode === 'client' && NET.conn && NET.conn.local) return;
    NET.connectBroker(2);
  }, 1800);
};
NET.connectBroker = function (index) {
  if (!NET.signalsActive) return;
  if (typeof Paho === 'undefined' || !Paho.MQTT) {
    NET.signalStatus = 'MQTT-клиент не загружен; доступен локальный сигналинг'; return;
  }
  var b = NET.brokers[index] || (NET.brokers[index] = { ready: false, attempts: 0 });
  var gen = NET.generation, client;
  function retry(error) {
    if (gen !== NET.generation || !NET.signalsActive || b.client !== client || b.retrying) return;
    b.ready = false; b.retrying = true;
    b.error = error && (error.errorMessage || error.message) || 'Соединение с брокером потеряно';
    NET.signalStatus = 'Брокер недоступен; повторное подключение';
    NET.later(function () {
      b.retrying = false;
      NET.connectBroker(index);
    }, Math.min(15000, 1000 * Math.pow(2, Math.min(++b.attempts, 4))));
  }
  try {
    client = new Paho.MQTT.Client(NET.brokerURLs[index], 'rpx_' + NET.session + '_' + index);
    b.client = client;
    b.retry = retry;
    b.statePending = b.controlPending = 0;
    client.onMessageDelivered = function (msg) {
      if (b.client !== client || msg.qos !== 1) return;
      if (msg._rpxState) b.statePending = Math.max(0, b.statePending - 1);
      else b.controlPending = Math.max(0, b.controlPending - 1);
    };
    client.onConnectionLost = retry;
    client.onMessageArrived = function (msg) {
      if (gen !== NET.generation || msg.retained || msg.destinationName !== NET.topic || msg.payloadString.length > 65536) return;
      try { NET.receiveSignal(JSON.parse(msg.payloadString), 'mqtt'); } catch (e) { }
    };
    client.connect({ useSSL: true, mqttVersion: 4, cleanSession: true,
      timeout: 7, keepAliveInterval: 20,
      onFailure: retry,
      onSuccess: function () {
        if (gen !== NET.generation || !NET.signalsActive || NET.brokers[index] !== b) { try { client.disconnect(); } catch (e) { } return; }
        client.subscribe(NET.topic, { qos: 1, timeout: 5, onFailure: function () {
          try { client.disconnect(); } catch (e) { } retry();
        }, onSuccess: function () {
          if (gen !== NET.generation || !NET.signalsActive) return;
          b.ready = true; b.attempts = 0; b.error = ''; NET.signalStatus = 'mqtt'; NET.discover();
        } });
      }
    });
  } catch (e) { retry(); }
};
NET.receiveSignal = function (m, route) {
  if (NET.status === 'error' || !m || m.v !== 1 || m.room !== NET.code ||
      !/^[a-f0-9]{24}$/.test(m.from) || m.from === NET.session ||
      (m.to !== '*' && m.to !== NET.session) || typeof m.mid !== 'string' || m.mid.length > 80 ||
      !m.body || typeof m.body !== 'object') return;
  if (m.type === 'part') { NET.receivePart(m); return; }
  if (NET.seen.has(m.mid)) return;
  NET.seen.set(m.mid, true);
  if (NET.seen.size > 512) NET.seen.delete(NET.seen.keys().next().value);
  var c = NET.peers[m.from], body = m.body;
  if (c && !c.closed && body.sid === c.sid && !c.local) {
    if (m.type === 'relay-hello') { NET.receiveRelayHello(c, body); return; }
    if (m.type === 'relay') { NET.receiveRelay(c, body); return; }
  }
  if (NET.mode === 'host' && m.type === 'join') {
    if (c && !c.closed) {
      if (!c.open && c.pc.localDescription) NET.describe(c);
      return;
    }
    if (Object.keys(NET.peers).length >= 4) { NET.signal('reject', m.from, { why: 'Комната полна (макс. 5 игроков)' }); return; }
    c = NET.makeConn(m.from, NET.token(), route === 'local');
    NET.hostAccept(c);
    NET.attachChannel(c, c.pc.createDataChannel('control', { ordered: true }));
    NET.attachChannel(c, c.pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }));
    NET.enqueue(c, async function () {
      await c.pc.setLocalDescription(await c.pc.createOffer()); NET.describe(c);
    });
    return;
  }
  if (NET.mode === 'client' && m.type === 'reject' && !NET.conn) {
    NET.fail(String(body.why || 'Подключение отклонено.').slice(0, 200)); return;
  }
  if (m.type === 'offer' && NET.mode === 'client') {
    if (!body.sdp || body.sdp.type !== 'offer' || typeof body.sdp.sdp !== 'string' || !/^[a-f0-9]{24}$/.test(body.sid)) return;
    if (NET.conn && (NET.conn.peer !== m.from || NET.conn.sid !== body.sid)) return;
    if (!c) {
      c = NET.makeConn(m.from, body.sid, route === 'local'); NET.conn = c;
      c.pc.ondatachannel = function (e) { NET.attachChannel(c, e.channel); };
    }
    if (!c.local && body.key) NET.prepareRelayKey(c, body.key);
    NET.enqueue(c, async function () {
      if (!c.pc.remoteDescription) {
        await c.pc.setRemoteDescription(body.sdp); await NET.flushICE(c);
        await c.pc.setLocalDescription(await c.pc.createAnswer());
      }
      NET.describe(c);
    });
    return;
  }
  if (m.type === 'ice' && !c && NET.mode === 'client') {
    if (!/^[a-f0-9]{24}$/.test(body.sid) || !body.candidate) return;
    var key = m.from + ':' + body.sid;
    var list = NET.earlyICE.get(key) || [];
    if (list.length < 64) list.push(body.candidate);
    NET.earlyICE.set(key, list);
    if (NET.earlyICE.size > 8) NET.earlyICE.delete(NET.earlyICE.keys().next().value);
    return;
  }
  if (!c || c.closed || c.sid !== body.sid || c.open) return;
  if (m.type === 'answer' && NET.mode === 'host' && body.sdp && body.sdp.type === 'answer') {
    if (!c.local && body.key) NET.prepareRelayKey(c, body.key);
    NET.enqueue(c, async function () {
      if (!c.pc.remoteDescription) { await c.pc.setRemoteDescription(body.sdp); await NET.flushICE(c); }
    });
  } else if (m.type === 'ice' && body.candidate) {
    NET.enqueue(c, async function () {
      if (c.pc.remoteDescription) await c.pc.addIceCandidate(body.candidate);
      else if (c.ice.length < 64) c.ice.push(body.candidate);
    });
  }
};
NET.describe = function (c) {
  if (c.closed || c.open || !c.pc.localDescription) return;
  function send() {
    if (!c.closed && !c.open && c.pc.localDescription) NET.signal(c.pc.localDescription.type, c.peer, {
      sid: c.sid, sdp: c.pc.localDescription.toJSON(), key: c.publicKey
    }, c);
  }
  // Prepare fallback keys with SDP while signaling is healthy; fallback does
  // not have to wait for another round trip after ICE has already failed.
  if (c.local) send(); else NET.getRelayKeys(c).then(send).catch(function () { send(); });
};
NET.enqueue = function (c, job) {
  c.chain = c.chain.then(function () { if (!c.closed && !c.rtcStopped) return job(); }).catch(function (e) {
    if (!c.closed && !c.rtcStopped) NET.connectionError(c, 'Ошибка согласования WebRTC: ' + e.message);
  });
};
NET.flushICE = async function (c) {
  while (c.ice.length && !c.closed) await c.pc.addIceCandidate(c.ice.shift());
};
NET.makeConn = function (peer, sid, local) {
  var pc = new RTCPeerConnection({ iceServers: local ? [] : NET_ICE });
  var key = peer + ':' + sid;
  var c = { peer: peer, sid: sid, pc: pc, local: local, dc: null, fast: null,
    open: false, closed: false, _gid: 0, chain: Promise.resolve(),
    ice: NET.earlyICE.get(key) || [], inputSeq: -1, lastInput: 0,
    transport: 'rtc', pending: new Map(), received: new Map(), tx: Promise.resolve(),
    rx: Promise.resolve(), txSeq: 0, controlSeq: 0, nextControl: 1,
    lastHeard: NET.now(), relayWanted: false, relayConfirmed: false, txQueued: 0 };
  NET.earlyICE.delete(key); NET.peers[peer] = c;
  c.close = function () { NET.closeConn(c); };
  pc.onicecandidate = function (e) {
    if (e.candidate && !c.closed && !c.open)
      NET.signal('ice', peer, { sid: sid, candidate: e.candidate.toJSON() }, c);
  };
  pc.onconnectionstatechange = function () {
    if (c.closed) return;
    if (pc.connectionState === 'failed') NET.connectionError(c, 'Прямое P2P-соединение не установлено. NAT/Firewall может требовать TURN.');
    else if (pc.connectionState === 'disconnected' && !c.disconnectTimer) {
      c.disconnectTimer = NET.later(function () {
        c.disconnectTimer = null;
        if (!c.closed && pc.connectionState === 'disconnected') NET.connectionError(c, 'Связь с игроком потеряна.');
      }, 8000);
    }
  };
  c.timeout = NET.later(function () {
    if (!c.open) NET.connectionError(c, 'Истекло время подключения WebRTC. Проверьте сеть; может требоваться TURN.');
  }, 25000);
  if (!local) c.fallbackTimer = NET.later(function () {
    if (!c.closed && !c.open) NET.beginRelay(c);
  }, NET_ICE.some(function (server) {
    return [].concat(server.urls || []).some(function (url) { return /^turns?:/.test(url); });
  }) ? 15000 : 6000);
  return c;
};
NET.attachChannel = function (c, dc) {
  if (dc.label === 'control' && !c.dc) c.dc = dc;
  else if (dc.label === 'state' && !c.fast) c.fast = dc;
  else { dc.close(); return; }
  dc.onopen = function () {
    if (c.closed || c.open || !c.dc || !c.fast || c.dc.readyState !== 'open' || c.fast.readyState !== 'open') return;
    NET.openConn(c, 'rtc');
  };
  dc.onmessage = function (e) {
    if (c.closed || c.transport !== 'rtc' || typeof e.data !== 'string' || e.data.length > 65536) return;
    try {
      var m = JSON.parse(e.data);
      if (!m || typeof m !== 'object') return;
      var transient = m.t === 's' || m.t === 'mv';
      if (transient !== (dc === c.fast)) return;
      NET.receiveGame(c, m);
    } catch (e) { console.warn('Некорректный сетевой пакет', e); }
  };
  dc.onclose = function () { if (!c.closed) NET.connectionError(c, 'Игрок отключился.'); };
  dc.onerror = function () { if (!c.closed) NET.connectionError(c, 'Ошибка канала WebRTC.'); };
};
NET.closeConn = function (c) {
  if (!c || c.closed) return;
  c.closed = true; c.open = false;
  clearTimeout(c.timeout); clearTimeout(c.disconnectTimer); clearTimeout(c.fallbackTimer);
  c.pending.clear(); c.received.clear();
  [c.dc, c.fast].forEach(function (dc) { if (dc) { dc.onclose = dc.onerror = null; try { dc.close(); } catch (e) { } } });
  c.pc.onicecandidate = c.pc.onconnectionstatechange = c.pc.ondatachannel = null;
  c.pc.close();
};
NET.connectionError = function (c, msg) {
  if (c.closed) return;
  if (!c.local && c.transport !== 'mqtt') { NET.beginRelay(c); return; }
  if (NET.mode === 'host') NET.dropConn(c);
  else if (NET.status !== 'error') NET.fail(msg || 'Хост отключился.');
};
NET.receivePart = function (m) {
  var p = m.body;
  if (typeof p.id !== 'string' || p.id.length > 65 || !p.id.startsWith(m.from + ':') ||
      !Number.isInteger(p.total) || p.total < 2 || p.total > 128 ||
      !Number.isInteger(p.n) || p.n < 0 || p.n >= p.total ||
      typeof p.data !== 'string' || p.data.length > 700 || !/^[A-Za-z0-9+/=]+$/.test(p.data) || NET.seen.has(p.id)) return;
  NET.fragments.forEach(function (a, id) { if (NET.now() - a.at > 10) NET.fragments.delete(id); });
  var a = NET.fragments.get(p.id);
  if (!a) {
    if (NET.fragments.size >= 32) NET.fragments.delete(NET.fragments.keys().next().value);
    a = { from: m.from, to: m.to, total: p.total, parts: [], count: 0, at: NET.now() };
    NET.fragments.set(p.id, a);
  }
  if (a.total !== p.total || a.from !== m.from || a.to !== m.to) return;
  if (a.parts[p.n] === undefined) { a.parts[p.n] = p.data; a.count++; }
  if (a.count !== a.total) return;
  NET.fragments.delete(p.id);
  try {
    var full = JSON.parse(new TextDecoder().decode(NET.unb64(a.parts.join(''))));
    if (full.mid === p.id && full.from === a.from && full.to === a.to && full.type !== 'part') NET.receiveSignal(full, 'mqtt');
  } catch (e) { }
};

NET.openConn = function (c, transport) {
  if (c.closed) return;
  c.transport = transport; c.open = true; c.lastHeard = NET.now();
  c.relayWanted = false;
  clearTimeout(c.timeout); clearTimeout(c.fallbackTimer);
  if (transport === 'mqtt') {
    c.rtcStopped = true;
    c.pc.onicecandidate = c.pc.onconnectionstatechange = c.pc.ondatachannel = null;
    [c.dc, c.fast].forEach(function (dc) { if (dc) dc.onclose = dc.onerror = null; });
    c.pc.close();
  }
  if (NET.mode === 'host') {
    if (c._gid) NET.sendTo(c, NET.buildSnap());
    else if (G && zone) NET.welcome(c);
    else { NET.pendingGuests.push(c); NET.sendTo(c, { t: 'wait' }); }
  } else {
    // Internet connections keep broker subscriptions for recovery after ICE loss.
    if (c.local) {
      clearInterval(NET.keepaliveTimer); NET.keepaliveTimer = null; NET.closeSignals();
    }
    NET.sendTo(c, { t: 'hi' });
  }
};
NET.receiveGame = function (c, m) {
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
  if (m.t === 'ping') { NET.sendTo(c, { t: 'pong', at: m.at }); return; }
  if (m.t === 'pong') { if (Number.isFinite(m.at)) NET.ping = Math.round((NET.now() - m.at) * 1000); return; }
  if (NET.mode === 'host') NET.hostMsg(c, m); else NET.clientMsg(m);
};

/* NAT fallback needs only outgoing WSS, not UDP, port forwarding or TURN accounts.
 * ECDH P-256 + AES-GCM hides game packets from public broker subscribers.
 * The invitation code still does not authenticate a player's identity.
 * Reliable packets use ACK/retry/ordering; stale snapshots are never retransmitted.
 */
NET.b64 = function (bytes) { return btoa(String.fromCharCode.apply(null, new Uint8Array(bytes))); };
NET.unb64 = function (s) { return Uint8Array.from(atob(s), function (v) { return v.charCodeAt(0); }); };
NET.getRelayKeys = function (c) {
  if (!c.keys) c.keys = crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
    .then(async function (keys) {
      c.publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey); return keys;
    });
  return c.keys;
};
NET.relayHello = function (c) {
  if (c.closed || c.local) return;
  c.lastHello = NET.now();
  NET.getRelayKeys(c).then(function () {
    if (!c.closed) NET.signal('relay-hello', c.peer, { sid: c.sid, key: c.publicKey }, c);
  }).catch(function () {
    if (!c.closed) { c.transport = 'mqtt'; NET.connectionError(c, 'Браузер не поддерживает защищённый резервный канал. Откройте игру по HTTPS.'); }
  });
};
NET.beginRelay = function (c) {
  if (c.closed || c.local || c.transport === 'mqtt') return;
  if (!c.relayWanted) { c.relayWanted = true; c.relayStarted = NET.now(); }
  if (NET.mode === 'client') NET.statusText = 'ПОДКЛЮЧЕНИЕ ЧЕРЕЗ РЕЗЕРВНЫЙ КАНАЛ…';
  NET.relayHello(c);
  if (c.aes) NET.openConn(c, 'mqtt');
};
NET.receiveRelayHello = function (c, body) {
  if (!NET.prepareRelayKey(c, body.key)) return;
  if (c.transport !== 'mqtt') { c.relayWanted = true; c.relayStarted = c.relayStarted || NET.now(); }
  if (NET.now() - (c.lastHello || 0) > 1) NET.relayHello(c);
  c.keyReady.then(function () { if (!c.closed && c.aes && c.transport !== 'mqtt') NET.openConn(c, 'mqtt'); });
};
NET.prepareRelayKey = function (c, k) {
  if (!k || k.kty !== 'EC' || k.crv !== 'P-256' ||
      !/^[A-Za-z0-9_-]{43}$/.test(k.x) || !/^[A-Za-z0-9_-]{43}$/.test(k.y)) return false;
  var fingerprint = k.x + ':' + k.y;
  if (c.remoteKey && c.remoteKey !== fingerprint) return false;
  if (c.keyReady) return true;
  c.remoteKey = fingerprint;
  c.keyReady = NET.getRelayKeys(c).then(async function (keys) {
    var remote = await crypto.subtle.importKey('jwk',
      { kty: 'EC', crv: 'P-256', x: k.x, y: k.y, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    c.aes = await crypto.subtle.deriveKey({ name: 'ECDH', public: remote }, keys.privateKey,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    if (!c.closed && c.relayWanted) NET.openConn(c, 'mqtt');
  }).catch(function () {
    if (!c.closed) { c.transport = 'mqtt'; NET.connectionError(c, 'Не удалось создать защищённый резервный канал.'); }
  });
  return true;
};
NET.relayAAD = function (c, from, to, seq, zip) {
  return new TextEncoder().encode([NET.code, c.sid, from, to, seq, zip ? 1 : 0].join('|'));
};
NET.compressRelay = async function (data) {
  if (data.length < 800 || typeof CompressionStream === 'undefined') return { data: data, zip: false };
  var zipped = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return zipped.length < data.length ? { data: zipped, zip: true } : { data: data, zip: false };
};
NET.expandRelay = async function (data) {
  var reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  var chunks = [], size = 0;
  for (;;) {
    var item = await reader.read(); if (item.done) break;
    size += item.value.length;
    if (size > 32000) { await reader.cancel(); throw Error('oversized relay packet'); }
    chunks.push(item.value);
  }
  var out = new Uint8Array(size), at = 0;
  chunks.forEach(function (chunk) { out.set(chunk, at); at += chunk.length; }); return out;
};
NET.relaySend = function (c, obj) {
  if (!c.aes || c.closed) return false;
  var transient = obj.t === 's' || obj.t === 'mv', ack = obj.t === '_ack';
  // Limit public-broker traffic to 10 snapshots/s; direct WebRTC stays at 20 Hz.
  if (obj.t === 's' && NET.now() - (c.lastRelaySnap || 0) < 0.095) return false;
  if (c.txQueued >= (transient ? 1 : 64) || (!transient && !ack && c.pending.size >= 64)) return false;
  var q = transient || ack ? 0 : ++c.controlSeq;
  var data = new TextEncoder().encode(JSON.stringify({ q: q, m: obj }));
  if (data.length > 32000) { NET.connectionError(c, 'Сетевой пакет слишком большой для резервного канала.'); return false; }
  if (obj.t === 's') c.lastRelaySnap = NET.now();
  c.txQueued++;
  c.tx = c.tx.then(async function () {
    if (c.closed) return;
    var seq = ++c.txSeq, iv = crypto.getRandomValues(new Uint8Array(12));
    var packed = await NET.compressRelay(data);
    var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv,
      additionalData: NET.relayAAD(c, NET.session, c.peer, seq, packed.zip) }, c.aes, packed.data);
    if (c.closed) return;
    var body = { sid: c.sid, seq: seq, iv: NET.b64(iv), data: NET.b64(encrypted), zip: packed.zip, state: transient };
    if (q) c.pending.set(q, { body: body, at: NET.now() });
    NET.signal('relay', c.peer, body, c);
  }).catch(function () {
    if (!c.closed) NET.connectionError(c, 'Ошибка резервного канала.');
  }).finally(function () { c.txQueued--; });
  return true;
};
NET.receiveRelay = function (c, body) {
  if (!c.keyReady || !Number.isSafeInteger(body.seq) || body.seq < 1 ||
      typeof body.iv !== 'string' || body.iv.length !== 16 ||
      typeof body.data !== 'string' || body.data.length > 44000 || c.rxQueued >= 128) return;
  c.rxQueued = (c.rxQueued || 0) + 1;
  c.rx = c.rx.then(async function () {
    await c.keyReady;
    if (c.closed || !c.aes) return;
    var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: NET.unb64(body.iv),
      additionalData: NET.relayAAD(c, c.peer, NET.session, body.seq, body.zip) }, c.aes, NET.unb64(body.data));
    if (body.zip) decrypted = await NET.expandRelay(decrypted);
    if (c.closed) return;
    var packet = JSON.parse(new TextDecoder().decode(decrypted)), q = packet.q, m = packet.m;
    if (!Number.isSafeInteger(q) || q < 0 || !m || typeof m !== 'object') return;
    c.lastHeard = NET.now(); c.relayConfirmed = true;
    if (c.transport !== 'mqtt') NET.openConn(c, 'mqtt');
    if (m.t === '_ack') { if (Number.isSafeInteger(m.q)) c.pending.delete(m.q); return; }
    if (!q) { NET.receiveGame(c, m); return; }
    if (q >= c.nextControl + 64) return;
    NET.relaySend(c, { t: '_ack', q: q });
    if (q < c.nextControl || c.received.has(q)) return;
    c.received.set(q, m);
    while (!c.closed && c.received.has(c.nextControl)) {
      var next = c.received.get(c.nextControl); c.received.delete(c.nextControl++);
      NET.receiveGame(c, next);
    }
  }).catch(function () { /* Ignore unauthenticated public-topic packets. */ })
    .finally(function () { c.rxQueued--; });
};
NET.serviceRelay = function () {
  Object.keys(NET.peers).forEach(function (id) {
    var c = NET.peers[id], now = NET.now();
    if (c.closed || c.local) return;
    if ((c.relayWanted || (c.transport === 'mqtt' && !c.relayConfirmed)) && now - (c.lastHello || 0) > 1)
      NET.relayHello(c);
    if (c.relayWanted && now - c.relayStarted > 20) {
      if (NET.mode === 'host') NET.dropConn(c); else NET.fail('Хост не отвечает по резервному каналу.');
      return;
    }
    if (c.transport !== 'mqtt') return;
    if (now - c.lastHeard > 15) { NET.connectionError(c, 'Связь с игроком потеряна.'); return; }
    c.pending.forEach(function (p) {
      if (now - p.at > 0.75) { p.at = now; NET.signal('relay', c.peer, p.body, c); }
    });
  });
};
// Bfcache restores a page with closed connections; allow boot to run again.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', function () { NET.cleanup(); NET.mode = 'solo'; NET.status = ''; });
  window.addEventListener('pageshow', function (e) { if (e.persisted) NET.boot(); });
}

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

NET.hostAccept = function (conn) { NET.rate[conn.peer] = { n: 0, t: NET.now() }; };

NET.spawnPoint = function (slot) {
  var offsets = [[18, 0], [-18, 0], [0, 18], [0, -18], [18, -18], [-18, -18], [18, 18], [-18, 18], [0, -36], [-36, 0], [36, 0], [0, 36], [0, 0]];
  for (var i = 0; i < offsets.length; i++) {
    var o = offsets[(i + slot) % offsets.length];
    var p = { x: player.x + o[0], y: player.y + o[1], w: 16, h: 16 };
    if (p.x < 0 || p.y < 0 || p.x + 16 > zone.w * TILE || p.y + 16 > zone.h * TILE || boxSolid(p.x, p.y, 16, 16)) continue;
    var feet = feetBox(p);
    if ((zone.def.exits || []).some(function (e) {
      return rectsOverlap(feet.x, feet.y, feet.w, feet.h, e.x * TILE, e.y * TILE, e.w * TILE, e.h * TILE);
    })) continue;
    return p;
  }
  return { x: player.x, y: player.y };
};

NET.welcome = function (conn) {
  if (!conn || conn.open === false || conn._gid) return;
  if (!G || !zone) {
    if (NET.pendingGuests.indexOf(conn) < 0) NET.pendingGuests.push(conn);
    NET.sendTo(conn, { t: 'wait', msg: 'Хост запускает игровой мир…' });
    return;
  }
  var id = 1;
  while (NET.conns[id] && id <= 4) id++;
  if (id > 4) {
    NET.sendTo(conn, { t: 'bye', why: 'Комната полна (макс. 5 игроков)' });
    try { conn.close(); } catch (e) { }
    return;
  }
  var name = 'ИГРОК ' + (id + 1);
  var rp = NET.mkEnt(id, name);
  rp.conn = conn;

  var spawn = NET.spawnPoint(id - 1);
  var nx = spawn.x, ny = spawn.y;
  rp.x = nx; rp.y = ny;
  rp.targetX = nx; rp.targetY = ny;
  rp.dir = player.dir;
  remotePlayers[id] = rp;
  NET.conns[id] = conn;
  conn._gid = id;

  NET.sendTo(conn, { t: 'welcome', id: id, name: name, s: NET.buildSnap() });
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
  if (NET.peers[conn.peer] === conn) delete NET.peers[conn.peer];
  var gid = conn._gid;
  try { conn.close(); } catch (e) { }
  if (gid) {
    delete NET.conns[gid];
    if (remotePlayers[gid]) delete remotePlayers[gid];
    delete NET.dlgCb[conn.peer];
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
    if (NET.now() - r.t >= 1) { r.t = NET.now(); r.n = 0; }
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
    if (!rp || !Number.isSafeInteger(m.seq) || m.seq <= conn.inputSeq) return;
    conn.inputSeq = m.seq; conn.lastInput = NET.now();
    rp.input.u = !!m.u; rp.input.d = !!m.d;
    rp.input.l = !!m.l; rp.input.r = !!m.r;
    if (m.dr === 'up' || m.dr === 'down' || m.dr === 'left' || m.dr === 'right') rp.dir = m.dr;
    return;
  }
  if (t === 'cmd') {
    if (!rp) return;
    var k = m.k;
    if (k === 'act' || k === 'atk' || k === 'gun' || k === 'use' || k === 'bike' || k === 'respawn')
      if (rp.cmds.length < 32) rp.cmds.push(k);
    return;
  }
  if (t === 'dlgend') {
    var cb = NET.dlgCb[conn.peer];
    NET.dlgCb[conn.peer] = null;
    if (cb) { try { cb(); } catch (e) { if (typeof console !== 'undefined') console.error(e); } }
  }
};

NET.processCmds = function () {
  if (NET.mode !== 'host') return;
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
    t: 's', seq: ++NET.snapSeq, epoch: NET.zoneEpoch, z: zone.id, ex: zone.entry.x, ey: zone.entry.y,
    ps: ps, en: en, dr: dr, sp: sp, it: zone.takenIds.slice(), b: bl, tst: tst,
    G: G, o: (state === 'gameover' || (G && G.hp <= 0)) ? 1 : 0
  };
};

NET.onZoneLoad = function () {
  if (typeof NET === 'undefined' || NET.mode !== 'host' || !player) return;
  NET.zoneEpoch++;
  NET.snapT = 0;
  var n = 0;
  for (var gid in remotePlayers) {
    var rp = remotePlayers[gid];
    var spawn = NET.spawnPoint(n++);
    var nx = spawn.x, ny = spawn.y;
    rp.x = nx; rp.y = ny;
    rp.targetX = nx; rp.targetY = ny;
    rp.moving = false; rp.riding = false;
    rp.input = { u: false, d: false, l: false, r: false };
  }
};

NET.clientMsg = function (m) {
  if (!m || typeof m !== 'object') return;
  var t = m.t;
  if (t === 'welcome' || t === 'w') {
    if (NET.status !== 'connecting' || !Number.isInteger(m.id) || m.id < 1 || m.id > 4) return;
    if (!NET.validSnap(m.s) || !m.s.ps.some(function (p) { return p.i === m.id; })) {
      NET.fail('Хост прислал некорректное начальное состояние.'); return;
    }
    if (NET.watchdogTimer) { clearTimeout(NET.watchdogTimer); NET.watchdogTimer = null; }
    NET.myId = m.id;
    NET.status = 'open';
    NET.statusText = 'КОМНАТА ' + NET.code;
    NET.applySnap(m.s, true);
  } else if (t === 's') {
    if (NET.status === 'open') NET.applySnap(m, false);
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
NET.validSnap = function (s) {
  return !!(s && s.G && typeof s.G === 'object' && Number.isFinite(s.G.hp) &&
    RP.ZONES[s.z] && Number.isSafeInteger(s.seq) && Number.isSafeInteger(s.epoch) &&
    Array.isArray(s.ps) && s.ps.length <= 5 && s.ps.every(function (p) {
      return p && Number.isInteger(p.i) && p.i >= 0 && p.i <= 4 && Number.isFinite(p.x) && Number.isFinite(p.y);
    }) && Array.isArray(s.en) && s.en.every(function (e) {
      return e && Number.isSafeInteger(e.u) && ENEMY_DEF[e.t] && Number.isFinite(e.x) && Number.isFinite(e.y);
    }) && Array.isArray(s.sp) && Array.isArray(s.it) && Array.isArray(s.dr) && Array.isArray(s.b));
};
NET.applySnap = function (s, isW) {
  if (!NET.validSnap(s) || s.seq <= NET.lastSnap) return;
  NET.lastSnap = s.seq;
  var prevHp = G ? G.hp : -1;
  var wasOver = NET.overPrev;
  var zoneChanged = !isW && (!zone || s.z !== zone.id || s.epoch !== NET.lastEpoch);
  NET.lastEpoch = s.epoch;

  G = s.G;
  if (!G.flags) G.flags = {};
  if (!G.inv) G.inv = { goo: 0, photos: 0 };
  if (!G.items) G.items = { bike: false, gun: false };
  if (!G.keys) G.keys = { pass: false, key: false };

  if (isW || zoneChanged) {
    remotePlayers = {}; NET.selfTarget = null;
    loadZone(s.z, s.ex, s.ey);
    zone.enemies = []; // Rebuild by host UID, including same-zone respawn.
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

  if (!!s.o !== NET.overPrev) NET.hardSnap = true;
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
    NET.selfTarget = null;
  } else {
    // Reconcile prediction gradually every frame, not in 20 Hz jumps.
    NET.selfTarget = { dx: p.x - player.x, dy: p.y - player.y };
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
  if (NET.status !== 'open' || !G || !zone || !player) return;
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

  updateParticles(dt);
  updateCam(false);
};

/* ---------- Главный сетевой тик ---------- */
NET.smoothClient = function (dt) {
  if (NET.mode !== 'client' || NET.status !== 'open' || !zone) return;
  var a = Math.min(1, Math.max(0, dt) * 20);
  Object.keys(remotePlayers).forEach(function (gid) {
    var rp = remotePlayers[gid];
    rp.x += (rp.targetX - rp.x) * a;
    rp.y += (rp.targetY - rp.y) * a;
    if (rp.moving) rp.anim += dt * (rp.riding ? 12 : 8);
    rp.atkFlash = Math.max(0, rp.atkFlash - dt);
  });
  zone.enemies.forEach(function (e) {
    if (e.targetX !== undefined) {
      e.x += (e.targetX - e.x) * a;
      e.y += (e.targetY - e.y) * a;
    }
  });
  if (player && NET.selfTarget) {
    var dx = NET.selfTarget.dx * a, dy = NET.selfTarget.dy * a;
    player.x += dx; player.y += dy;
    NET.selfTarget.dx -= dx; NET.selfTarget.dy -= dy;
  }
};

NET.tick = function (dt) {
  if (NET.mode === 'solo' || NET.status === 'error') return;
  if (NET.mode === 'host') {
    // A missing release packet/tab suspension must not keep a guest walking.
    Object.keys(NET.conns).forEach(function (id) {
      var c = NET.conns[id], rp = remotePlayers[id];
      if (rp && NET.now() - c.lastInput > 0.5)
        rp.input = { u: false, d: false, l: false, r: false };
    });
    NET.processCmds(); NET.flushGuests();
    if (!G || !zone || NET.status !== 'open') return;
    NET.snapT -= dt;
    if (NET.snapT <= 0) {
      NET.snapT = Math.max(0, NET.snapT + 1 / 20);
      var snap = NET.buildSnap();
      for (var id in NET.conns) NET.sendTo(NET.conns[id], snap);
    }
    return;
  }
  if (NET.status !== 'open' || !player) return;
  NET.smoothClient(dt);
  var active = state === 'play' && !document.hidden;
  var u = active && anyHeld(K_UP), d = active && anyHeld(K_DOWN);
  var l = active && anyHeld(K_LEFT), r = active && anyHeld(K_RIGHT);
  var sig = [u, d, l, r, player.dir].join(',');
  NET.mvT -= dt;
  if (sig !== NET.lastMv || NET.mvT <= 0) {
    if (NET.send({ t: 'mv', seq: ++NET.inputSeq, u: u, d: d, l: l, r: r, dr: player.dir })) {
      NET.lastMv = sig; NET.mvT = 0.1;
    }
  }
  NET.hiT -= dt;
  if (NET.hiT <= 0) { NET.hiT = 2; NET.send({ t: 'ping', at: NET.now() }); }
};
