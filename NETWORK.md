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
`wss://broker.hivemq.com:8884/mqtt`; an additional fallback is
`wss://test.mosquitto.org:8081/mqtt` (the project's public test broker).
All are subscribed while waiting for guests, with short startup delays.
This allows peers to meet on
either reachable broker instead of independently choosing different fallbacks.
Subscription completes before publishing; signaling uses QoS 0, clean sessions, non-retained
messages, unique message IDs and per-connection negotiation IDs prevent stale
offers and duplicate negotiations. Descriptions are resent during discovery
until the channels open. ICE that arrives before SDP is queued.
Repeated SDP includes gathered candidates, so recovery does not depend on
delivery of every trickled ICE packet. Application retries replace QoS 1
in-flight queues for signaling in the bundled Paho client.
Large signaling and relay envelopes are split into roughly 1 KB MQTT messages,
then reassembled with bounded buffers and expiry. This also handles transports
that accept small MQTT packets but silently lose large packets.
Direct connections send game packets exclusively through RTCDataChannels.
Internet guests keep broker subscriptions open for recovery; local guests close
signaling. Broker outages do not close established direct game connections.
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

If ICE fails, or the channels do not open within six seconds, both peers switch
to an encrypted MQTT game relay. With TURN configured, the timeout is 15 seconds
to allow TCP/TLS setup. The fallback needs outgoing WSS access, and works even
when there is no usable ICE candidate. ECDH P-256 derives an ephemeral AES-GCM
key, with public keys exchanged alongside SDP in advance; game state, input
and commands are encrypted before publishing. Large payloads are compressed
with deflate when the browser supports it, before encryption. Reliable
commands/welcome/dialogs use acknowledgements, bounded queues, ordered delivery
and retransmission. Relay MQTT packets use QoS 1; broker PUBACKs bound the
in-flight queue to one snapshot envelope and 32 control fragments per broker.
Busy brokers skip new replaceable snapshots. Duplicate commands execute once.
Snapshots run at 10 Hz on
the relay (20 Hz on direct WebRTC) and interpolate every frame. The HUD shows
`РЕЗЕРВНЫЙ КАНАЛ`. Relay peers time out after 15 seconds without authenticated
traffic; broker connections retry after failures. Existing players keep their
ID when switching from direct transport to the relay.

This trades latency for connectivity. Public brokers have no availability or
latency guarantee and are not a substitute for dedicated production relay
capacity. Both players must reach a common broker. No inbound port forwarding,
VPN or account credentials are needed. For better performance on restrictive
networks, supply additional ICE servers
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
network. Open `tests/network.html?quick` for forced ICE failure, encrypted relay,
lost/duplicated commands and snapshot checks; add `&public` to run those checks
through real public WSS brokers. These tests do not establish connectivity
between different ISPs/NATs. Upload the changed files to GitHub Pages and reload
both players' pages; `game.html` includes a versioned network script URL.

`node tests/network-node.cjs` checks the full encrypted relay protocol against
real public brokers, with an RTC stub that cannot establish direct channels.
It verifies welcome, commands and fragmented random snapshots without browser
WebSocket mediation. It does not verify native WebRTC itself.

Verification on 2026-10-04: the local/native co-op regression and deterministic
blocked-ICE relay checks passed. Real public-broker tests were intermittent:
signaling worked, welcome sometimes arrived, but sustained command/snapshot
delivery did not pass in either the browser or Node test. Do not claim reliable
Internet multiplayer from the deterministic checks alone. A reachable managed
TURN service (configured through `RP.NET_ICE`) or a dependable MQTT broker is
still required to establish reliable connectivity for restrictive NATs.
