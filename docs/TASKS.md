1) Map + discovery (MVP)

Goal: show nearby “nodes” (galleries / artworks) on a map, tappable to view details.
Build: map UI + nodes dataset (seed JSON for hackathon; later dynamic).
Best OSS:
	•	React-Leaflet + Leaflet (easy, mature, fast to integrate)  ￼
	•	MapLibre GL JS (vector tiles + GPU, more customization, more setup)  ￼

Latency expectations: mostly client-side; tile/network fetch dominates (usually ~100–800ms per tile burst depending on connectivity). Leaflet is lightweight; MapLibre can feel smoother at scale but needs style/tiles.  ￼

⸻

2) On-site check-in + geofence verification (MVP)

Goal: user arrives at node → app verifies they’re inside a radius/polygon before allowing capture/submit.
Best OSS:
	•	Turf.js for point-in-polygon / distance-to-polygon / buffer logic  ￼

Latency expectations: local compute is effectively instant (<10ms). Real latency is GPS acquisition (hundreds of ms to seconds) + device permissions.

⸻

3) Capture photo + upload (MVP)

Goal: take a photo, attach metadata (nodeId, lat/lng, timestamp, device info), upload reliably.
Storage options (hackathon-friendly):
	•	Supabase Storage (quick, built-in auth/RLS; also S3-compatible)  ￼
	•	Cloudflare R2 (S3-compatible, good for large media; no egress fees)  ￼

Latency expectations: upload time is payload-bound (photo size) + network; resumable uploads matter on mobile. Supabase supports multiple upload protocols; R2 is straightforward S3-style.  ￼

⸻

4) “Is this the right artwork?” verification (MVP → stronger over time)

Goal: reduce fraud/spoofing: ensure the submitted image matches the node’s reference(s) and is taken on-site.
Practical verification layers (in order):
	1.	Geofence pass (above)
	2.	Time window (must submit within N minutes of check-in)
	3.	Perceptual hash similarity against node reference images and/or recent submissions
	4.	Human/artist confirmation (upgrade)

Open source components:
	•	phash-js (browser-side perceptual hashing; note WASM ImageMagick download ~4MB)  ￼
	•	pHash (C++ library) (powerful but GPLv3—license may not fit your repo)  ￼

Latency expectations:
	•	Browser WASM hashing: tens–hundreds of ms per image on modern phones, plus initial WASM download cost.  ￼
	•	Server hashing (if you do it server-side): similar per-image compute, but adds upload/roundtrip.

⸻

5) Reputation / rank system + feature gating (MVP)

Goal: users gain “curator rank” based on verified submissions + endorsements; rank unlocks more nodes, filters, posting privileges.
Build: simple rules engine + scores stored in DB; gates in API + UI.

No special APIs needed beyond your backend + DB.

⸻

6) Attribution + “pay-to-post” microtransaction (MVP+)

Goal: before a high-ranked user can publish, they optionally tip artist (or pay a small fee) and embed proof in the post.
Frontend web3 libraries:
	•	Wagmi + Viem (good default for modern React dapps; type-safe)  ￼
	•	WalletConnect (broad wallet interoperability; use their examples/docs)  ￼
	•	thirdweb React SDK (fastest “hackathon velocity” for wallet + contract interactions)  ￼

Latency expectations: wallet connect + signature/tx approval dominates (seconds, user-dependent). On-chain confirmation adds chain time; you can treat “submitted” immediately and finalize later.

⸻

7) Decentralized storage of art references + receipts (Upgrade)

Goal: store reference images / metadata / “proof” in a tamper-resistant way (or at least content-addressed).
Options:
	•	Pinata IPFS Pinning Service API (very common; clean API)  ￼
	•	IPFS Pinning Services API spec (standard you can swap providers against)  ￼

Latency expectations: pinning is usually seconds; retrieval depends on gateways/caching.

⸻

8) Web3-native identity (Upgrade)

Goal: users can authenticate with wallet (for endorsements, rank proofs, etc.).
	•	SIWE (spruceid/siwe) + examples (works well with typical web sessions)  ￼

Latency expectations: one signature per login (seconds; user-dependent).

⸻

9) Indexing/querying on-chain activity (Upgrade)

Goal: easily query tips, mints, endorsements, ranks from chain without custom indexers.
	•	The Graph (Subgraphs)  ￼

Latency expectations: indexed data is fast to query; freshness depends on indexing lag (often seconds to minutes depending on setup/network).

⸻

10) Notifications (Upgrade)

Goal: notify users of new nodes, artist responses, event unlocks.
	•	Firebase Cloud Messaging (Web)  ￼
	•	OneSignal Web Push (often simpler cross-browser/product layer)  ￼

Latency expectations: near real-time once subscribed; delivery varies by platform/browser.

⸻

11) Observability (Upgrade, but worth doing early)

Goal: traces/metrics to debug demo failures quickly.
	•	OpenTelemetry FastAPI instrumentation  ￼

Latency expectations: minimal overhead; huge debugging benefit.