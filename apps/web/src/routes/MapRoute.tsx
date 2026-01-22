import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  DirectionsService,
  GoogleMap,
  Marker,
  useJsApiLoader
} from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import { ensureAnonymousSession } from "../auth/session";
import { createCheckinChallenge, checkIn } from "../features/checkin/api";
import { createCapture, uploadCaptureImage } from "../features/captures/api";
import { listNodes } from "../features/nodes/api";
import type { NodePublic } from "../features/nodes/types";

const NODE_FETCH_DEBOUNCE_MS = 250;
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: -33.9249, lng: 18.4241 };
const MAP_CONTAINER_STYLE = { height: "100%", width: "100%" };
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: "greedy"
};

function bboxString(bounds: google.maps.LatLngBounds): string {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`;
}

export function MapRoute() {
  const [nodes, setNodes] = useState<NodePublic[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const [status, setStatus] = useState<string>("Starting…");
  const [checkinToken, setCheckinToken] = useState<string | null>(null);
  const [lastCaptureId, setLastCaptureId] = useState<string | null>(null);
  const navigate = useNavigate();
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const { isLoaded, loadError } = useJsApiLoader({
    id: "groundedart-google-maps",
    googleMapsApiKey: googleMapsApiKey ?? "",
    libraries: []
  });
  const [directionsRequest, setDirectionsRequest] = useState<google.maps.DirectionsRequest | null>(null);
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const nodeFetchAbortRef = useRef<AbortController | null>(null);
  const nodeFetchDebounceRef = useRef<number | null>(null);
  const lastBboxRef = useRef<string | undefined>(undefined);
  const mapRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    ensureAnonymousSession()
      .then(() => setStatus("Ready"))
      .catch((e) => setStatus(`Session error: ${String(e)}`));
  }, []);

  useEffect(() => {
    if (!googleMapsApiKey) {
      setStatus("Map config error: missing VITE_GOOGLE_MAPS_API_KEY");
    }
  }, [googleMapsApiKey]);

  useEffect(() => {
    if (loadError) {
      setStatus(`Map load error: ${loadError.message ?? "unknown error"}`);
    }
  }, [loadError]);

  const scheduleNodesRefresh = useCallback((bbox?: string) => {
    lastBboxRef.current = bbox;
    if (nodeFetchDebounceRef.current !== null) window.clearTimeout(nodeFetchDebounceRef.current);

    nodeFetchDebounceRef.current = window.setTimeout(() => {
      nodeFetchAbortRef.current?.abort();
      const controller = new AbortController();
      nodeFetchAbortRef.current = controller;

      listNodes(lastBboxRef.current, { signal: controller.signal })
        .then((res) => {
          setNodes(res.nodes);
          setSelectedNodeId((prev) => (prev && !res.nodes.some((n) => n.id === prev) ? null : prev));
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setStatus(`Nodes error: ${String(e)}`);
        });
    }, NODE_FETCH_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      nodeFetchAbortRef.current?.abort();
      if (nodeFetchDebounceRef.current !== null) window.clearTimeout(nodeFetchDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    setDirectionsRequest(null);
    setDirectionsResult(null);
  }, [selectedNodeId]);

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const handleMapUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  const handleMapIdle = useCallback(() => {
    if (!mapRef.current) return;
    const bounds = mapRef.current.getBounds();
    if (!bounds) return;
    scheduleNodesRefresh(bboxString(bounds));
  }, [scheduleNodesRefresh]);

  async function handleCheckIn() {
    if (!selectedNode) return;
    setStatus("Requesting location…");
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10_000 })
    );
    setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });

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

  function handleOpenDetails() {
    if (!selectedNode) return;
    navigate(`/nodes/${selectedNode.id}`, { state: { node: selectedNode } });
  }

  async function handleRequestDirections() {
    if (!selectedNode) return;
    if (!isLoaded || !googleMapsApiKey) {
      setStatus("Map not ready for directions (missing API key or still loading).");
      return;
    }

    setStatus("Requesting location for directions…");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10_000 })
      );
      const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setUserLocation(origin);
      const destination = { lat: selectedNode.lat, lng: selectedNode.lng };
      setDirectionsResult(null);
      setDirectionsRequest({
        origin,
        destination,
        travelMode: google.maps.TravelMode.WALKING
      });
      setStatus("Requesting directions…");
    } catch (err) {
      setStatus(`Directions error: ${String(err)}`);
    }
  }

  const handleDirectionsResponse = useCallback(
    (res: google.maps.DirectionsResult | null, status?: google.maps.DirectionsStatus) => {
      if (!res) {
        if (status && status !== "OK") setStatus(`Directions error: ${status}`);
        return;
      }

      if (status === "OK") {
        setDirectionsResult(res);
        setDirectionsRequest(null);
        setStatus("Route ready.");
      } else if (status) {
        setDirectionsRequest(null);
        setStatus(`Directions error: ${status}`);
      }
    },
    []
  );

  return (
    <div className="layout">
      <div className="panel">
        <h1>Grounded Art (MVP scaffold)</h1>
        <div className="muted">{status}</div>

        <div className="node">
          <div className="muted">Nodes in view: {nodes.length}</div>
          <button onClick={() => scheduleNodesRefresh(lastBboxRef.current)}>Refresh</button>
        </div>

        {selectedNode ? (
          <div className="node">
            <div>
              <strong>{selectedNode.name}</strong>
            </div>
            <div className="muted">{selectedNode.category}</div>
            {selectedNode.description ? <div>{selectedNode.description}</div> : null}
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleOpenDetails}>Open detail</button>
              <button onClick={handleCheckIn}>Check in</button>
              <button onClick={handleRequestDirections} disabled={!isLoaded}>
                Directions
              </button>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Token: {checkinToken ? `${checkinToken.slice(0, 8)}…` : "none"} | Last capture:{" "}
              {lastCaptureId ?? "none"} | Directions: {directionsResult ? "ready" : "not requested"}
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

      <div style={{ height: "100%", width: "100%" }}>
        {!googleMapsApiKey ? (
          <div className="muted" style={{ padding: 12 }}>
            Set VITE_GOOGLE_MAPS_API_KEY in apps/web/.env to load the map.
          </div>
        ) : !isLoaded ? (
          <div className="muted" style={{ padding: 12 }}>
            Loading Google Maps…
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            center={DEFAULT_CENTER}
            zoom={13}
            onLoad={handleMapLoad}
            onUnmount={handleMapUnmount}
            onIdle={handleMapIdle}
            options={MAP_OPTIONS}
          >
            {nodes.map((n) => (
              <Marker key={n.id} position={{ lat: n.lat, lng: n.lng }} onClick={() => setSelectedNodeId(n.id)} />
            ))}
            {userLocation ? (
              <Marker
                position={userLocation}
                title="Your location"
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 6,
                  fillColor: "#4285f4",
                  fillOpacity: 0.9,
                  strokeWeight: 2,
                  strokeColor: "#ffffff"
                }}
              />
            ) : null}
            {directionsRequest ? (
              <DirectionsService options={directionsRequest} callback={handleDirectionsResponse} />
            ) : null}
            {directionsResult ? (
              <DirectionsRenderer directions={directionsResult} options={{ suppressMarkers: true }} />
            ) : null}
          </GoogleMap>
        )}
      </div>
    </div>
  );
}
