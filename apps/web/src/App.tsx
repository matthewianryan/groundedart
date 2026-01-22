import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLngBounds } from "leaflet";
import { ensureAnonymousSession } from "./auth/session";
import { listNodes } from "./features/nodes/api";
import type { NodePublic } from "./features/nodes/types";
import { checkIn, createCheckinChallenge } from "./features/checkin/api";
import { createCapture, uploadCaptureImage } from "./features/captures/api";

function bboxString(bounds: LatLngBounds): string {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
}

function MapEventBridge(props: { onBoundsChanged: (bbox: string) => void }) {
  const map = useMapEvents({
    moveend() {
      props.onBoundsChanged(bboxString(map.getBounds()));
    },
    zoomend() {
      props.onBoundsChanged(bboxString(map.getBounds()));
    }
  });
  return null;
}

export function App() {
  const [nodes, setNodes] = useState<NodePublic[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const [status, setStatus] = useState<string>("Starting…");
  const [checkinToken, setCheckinToken] = useState<string | null>(null);
  const [lastCaptureId, setLastCaptureId] = useState<string | null>(null);

  useEffect(() => {
    ensureAnonymousSession()
      .then(() => setStatus("Ready"))
      .catch((e) => setStatus(`Session error: ${String(e)}`));
  }, []);

  async function refreshNodes(bbox?: string) {
    const res = await listNodes(bbox);
    setNodes(res.nodes);
    if (selectedNodeId && !res.nodes.some((n) => n.id === selectedNodeId)) setSelectedNodeId(null);
  }

  async function handleCheckIn() {
    if (!selectedNode) return;
    setStatus("Requesting location…");
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10_000 })
    );

    setStatus("Creating check-in challenge…");
    const challenge = await createCheckinChallenge(selectedNode.id);

    setStatus("Verifying geofence…");
    const res = await checkIn(selectedNode.id, {
      challenge_id: challenge.challenge_id,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy_m: pos.coords.accuracy
    });
    setCheckinToken(res.checkin_token);
    setStatus("Checked in (token issued).");
  }

  async function handleCreateCapture(file: File | null) {
    if (!selectedNode || !checkinToken) return;
    setStatus("Creating capture…");
    const created = await createCapture({
      node_id: selectedNode.id,
      checkin_token: checkinToken
    });
    setLastCaptureId(created.capture.id);

    if (file) {
      setStatus("Uploading image…");
      await uploadCaptureImage(created.capture.id, file);
      setStatus("Uploaded.");
    } else {
      setStatus("Capture created (no image uploaded).");
    }
  }

  return (
    <div className="layout">
      <div className="panel">
        <h1>Grounded Art (MVP scaffold)</h1>
        <div className="muted">{status}</div>

        <div className="node">
          <div className="muted">Nodes in view: {nodes.length}</div>
          <button onClick={() => refreshNodes()}>Refresh</button>
        </div>

        {selectedNode ? (
          <div className="node">
            <div>
              <strong>{selectedNode.name}</strong>
            </div>
            <div className="muted">{selectedNode.category}</div>
            {selectedNode.description ? <div>{selectedNode.description}</div> : null}
            <button onClick={handleCheckIn}>Check in</button>
            <div className="muted">
              Token: {checkinToken ? `${checkinToken.slice(0, 8)}…` : "none"} | Last capture:{" "}
              {lastCaptureId ?? "none"}
            </div>
            <div style={{ marginTop: 8 }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleCreateCapture(e.target.files?.[0] ?? null).catch((err) => setStatus(String(err)))}
              />
            </div>
          </div>
        ) : (
          <div className="node">
            <div className="muted">Select a node marker to check in.</div>
          </div>
        )}
      </div>

      <MapContainer center={[-33.9249, 18.4241]} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEventBridge
          onBoundsChanged={(bbox) => refreshNodes(bbox).catch((e) => setStatus(`Nodes error: ${String(e)}`))}
        />
        {nodes.map((n) => (
          <Marker
            key={n.id}
            position={[n.lat, n.lng]}
            eventHandlers={{
              click: () => setSelectedNodeId(n.id)
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
