# WebRTC co-op

`js/network.js` exports both `NET` and `RP.NET`; no PeerJS script or cloud service
is used. `game.html` loads the bundled Paho client before the network module.
The six-character room codes use the existing lobby alphabet (letters/digits).

Create a room with `game.html?host=ABC123` and join with
`game.html?join=ABC123`. The host starts its saved/new world immediately.
The host plus four guests share HP, inventory, quests, enemies and the zone.

Same-origin tabs in the same browser profile discover one another through
`BroadcastChannel('rpx_sig_' + code)`. Their RTC connections use no STUN servers,
so this path works with external networking unavailable. Serve the files with
HTTP on localhost for development; use HTTPS on GitHub Pages. Browser profile,
origin and storage partition must match for BroadcastChannel.

For Internet discovery the primary broker is
`wss://broker.emqx.io:8084/mqtt`; the backup is
`wss://broker.hivemq.com:8884/mqtt`. Both are subscribed while waiting for guests,
with a short delay before starting the backup. This allows peers to meet on
either reachable broker instead of independently choosing different fallbacks.
Subscription completes before publishing; QoS 0, clean sessions, non-retained
messages, unique message IDs and per-connection negotiation IDs prevent stale
offers and duplicate negotiations. Descriptions are resent during discovery
until the channels open. ICE that arrives before SDP is queued.
Repeated SDP includes gathered candidates, so recovery does not depend on
delivery of every trickled ICE packet. Application retries replace QoS 1
in-flight queues in the bundled Paho client.
Only discovery, SDP and ICE go to MQTT. The guest closes signaling after both
data channels open; the host keeps signaling available for new guests.
Broker outages do not close established game connections.
Failed MQTT publications also trigger reconnection and resubscription rather
than leaving signaling permanently disabled.

The ordered reliable `control` channel carries welcome, actions, dialogs and
ping/pong. The unordered `state` channel uses `maxRetransmits: 0` for movement
input and full snapshots at 20 Hz. Snapshot/input sequence numbers discard old
packets. Backpressure drops replaceable packets; input heartbeats and a 500 ms
host timeout handle lost key releases. Commands and connections are bounded.
Disconnected guest slots can be reused. `NET.ping` reports RTT in milliseconds.
`NET.signalStatus` and `NET.brokers[i].ready` expose signaling diagnostics.

Guests predict their own movement and reconcile gradually each frame. Remote
players/enemies receive target positions from snapshots, then interpolate with
`Math.min(1, dt * 20)` every frame, including menus and dialogs. Zone epochs
reset interpolation on transitions and same-zone respawns. Guest spawn points
avoid solid tiles and zone exits.

Direct WebRTC still depends on the players' networks. Public broker reachability
in Russia and a particular ping cannot be guaranteed. STUN alone cannot connect
every symmetric NAT/firewall pair. If needed, supply additional ICE servers
before loading `network.js`:

```html
<script>
RP.NET_ICE = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turns:YOUR_TURN_HOST:443', username: 'TEMPORARY_USER', credential: 'TEMPORARY_PASSWORD' }
];
</script>
```

Use short-lived TURN credentials supplied at runtime; permanent secrets cannot
be protected in a static website. TURN relays game traffic when direct ICE fails.
Public MQTT topics are discoverable; the room code is an invitation, not an
authentication mechanism. Keep the host's game running in an active tab: browser
background throttling also affects its authoritative simulation.

Run the browser integration tests with:

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/tests/network.html`. The automatic suite uses real
RTCPeerConnections with blocked external networking for local tests, and a
simulated broker transport for deterministic outage/duplication/ICE ordering
tests. The separate button tests the actual public brokers in your current
network. These tests do not establish connectivity between different ISPs/NATs.
