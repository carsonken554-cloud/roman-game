// Real public MQTT + the complete relay protocol, without browser WebSocket
// mediation. RTC is intentionally unavailable, to exercise the NAT fallback.
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const paho = fs.readFileSync('js/paho-mqtt.min.js', 'utf8');
const network = fs.readFileSync('js/network.js', 'utf8');
const code = 'N' + webcrypto.randomUUID().replace(/-/g, '').slice(0, 5).toUpperCase();
let attacks = 0, snapshots = 0;
const packets = [];
class DiagnosticWS extends WebSocket {
  send(data) {
    const bytes = new Uint8Array(data);
    if (bytes[0] >> 4 === 3) {
      let pos=1, remaining=0, multiplier=1, byte;
      do { byte=bytes[pos++]; remaining+=(byte&127)*multiplier; multiplier*=128; } while(byte&128);
      const start=pos, size=bytes[pos]*256+bytes[pos+1]; pos+=2;
      const topic = new TextDecoder().decode(bytes.slice(pos,pos+size)); pos+=size;
      if ((bytes[0] >> 1)&3) pos+=2;
      try {
        const m=JSON.parse(new TextDecoder().decode(bytes.slice(pos)));
        if (packets.length<20 || m.type==='relay' && !packets.some(p=>p.type==='relay')) packets.push({type:m.type,topic,actual:bytes.length-start,declared:remaining,qos:(bytes[0]>>1)&3});
      } catch(e) { packets.push({bad:e.message}); }
    }
    return super.send(data);
  }
}
class RTC {
  constructor() { this.connectionState = 'new'; }
  createDataChannel(label) { return { label, readyState: 'connecting', close() {} }; }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\n' }; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0\r\n' }; }
  async setLocalDescription(d) { this.localDescription = { ...d, toJSON: () => d }; }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  async addIceCandidate() {}
  close() { this.connectionState = 'closed'; }
}
function realm() {
  const storage = {};
  Object.defineProperties(storage, {
    setItem: { value(k,v) { storage[k] = v; } },
    getItem: { value(k) { return storage[k] ?? null; } },
    removeItem: { value(k) { delete storage[k]; } }
  });
  const context = vm.createContext({
    console, crypto: webcrypto, WebSocket: DiagnosticWS, RTCPeerConnection: RTC,
    performance, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array,
    CompressionStream, DecompressionStream, Blob, Response, btoa, atob,
    setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams,
    localStorage: storage, G: { hp: 10 }, zone: { id: 'home' }, state: 'play',
    remotePlayers: {}, addEventListener() {}, toast() {}
  });
  context.window = context;
  vm.runInContext(paho, context); vm.runInContext(network, context);
  return context;
}
const host = realm(), guest = realm();
[host, guest].forEach(w => {
  w.metrics = {in:{},out:{}};
  const signal = w.NET.signal, receive = w.NET.receiveSignal;
  w.NET.signal = function(type, ...args) { w.metrics.out[type]=(w.metrics.out[type]||0)+1; return signal(type,...args); };
  w.NET.receiveSignal = function(m, ...args) { w.metrics.in[m.type]=(w.metrics.in[m.type]||0)+1; return receive(m,...args); };
});
host.NET.welcome = c => {
  if (c._gid) return;
  c._gid = 1; host.NET.conns[1] = c;
  host.NET.sendTo(c, { t: 'welcome', id: 1 });
};
host.NET.buildSnap = () => ({ t: 's', seq: ++host.NET.snapSeq,
  data: btoa(String.fromCharCode(...webcrypto.getRandomValues(new Uint8Array(1800)))) });
host.NET.hostMsg = (c,m) => { if (m.t === 'cmd' && m.k === 'atk') attacks++; };
guest.NET.clientMsg = m => {
  if (m.t === 'welcome') { guest.NET.status = 'open'; clearTimeout(guest.NET.watchdogTimer); }
  if (m.t === 's') snapshots++;
};
host.NET.startHost(code); guest.NET.startClient(code);
let stream;
async function until(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw Error('timeout');
}
(async () => {
  try {
    await until(() => guest.NET.status === 'open', 30000);
    if (guest.NET.conn.transport !== 'mqtt') throw Error('fallback not selected');
    stream = setInterval(() => host.NET.sendTo(host.NET.conns[1], host.NET.buildSnap()), 200);
    guest.NET.sendCmd('atk');
    await until(() => attacks === 1 && snapshots >= 3, 10000);
    await until(() => guest.NET.conn.pending.size === 0, 5000);
    console.log(JSON.stringify({result:'PASS', transport:'encrypted MQTT', attacks, snapshots,
      brokers: host.NET.brokers.map((b,i) => ({url:host.NET.brokerURLs[i],ready:b.ready,error:b.error}))}));
  } catch(e) {
    console.log(JSON.stringify({result:'FAIL', error:e.message, attacks, snapshots, packets,
      peers: [host,guest].map(w => ({status:w.NET.status, message:w.NET.statusText,
        metrics:w.metrics,fragments:w.NET.fragments.size,pending:w.NET.conn&&w.NET.conn.pending.size,
        brokers:w.NET.brokers.map((b,i) => ({url:w.NET.brokerURLs[i],ready:b.ready,error:b.error}))}))}));
    process.exitCode = 1;
  } finally { clearInterval(stream); host.NET.cleanup(); guest.NET.cleanup(); }
})();
