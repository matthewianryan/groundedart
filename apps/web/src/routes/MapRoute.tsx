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
import { isApiError } from "../api/http";
import { createCheckinChallenge, checkIn } from "../features/checkin/api";
import { useUploadQueue } from "../features/captures/useUploadQueue";
import { formatNextUnlockLine, formatRankCapsNotes } from "../features/me/copy";
import { getMe } from "../features/me/api";
import type { MeResponse } from "../features/me/types";
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
const MAP_STYLE_STORAGE_KEY = "groundedart.mapStylePreset";

type MapStylePresetKey = "default" | "ultra-minimal" | "streets" | "context";
type MapStylePreset = {
  label: string;
  description: string;
  styles: google.maps.MapTypeStyle[] | null;
};

const MAP_STYLE_PRESETS: Record<MapStylePresetKey, MapStylePreset> = {
  default: {
    label: "Default",
    description: "Standard Google map styling.",
    styles: null
  },
  "ultra-minimal": {
    label: "Streets",
    description: "Road geometry only, with labels and POI removed.",
    styles: [
      { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] },
      { featureType: "transit", stylers: [{ visibility: "off" }] },
      { featureType: "administrative", stylers: [{ visibility: "off" }] },
      { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#FFFEF2" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#FFFEF2" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#000000" }, { visibility: "on" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] }
    ]
  },
  streets: {
    label: "Ultra Minimal",
    description: "All road classes visible with minimal context.",
    styles: [
      { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] },
      { featureType: "transit", stylers: [{ visibility: "off" }] },
      { featureType: "administrative", stylers: [{ visibility: "off" }] },
      { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#FFFEF2" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#FFFEF2" }] },
      { featureType: "road", elementType: "geometry.fill", stylers: [{ visibility: "off" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
      {
        featureType: "road.highway",
        elementType: "geometry.stroke",
        stylers: [{ visibility: "on" }, { color: "#000000" }, { weight: 2.0 }]
      },
      {
        featureType: "road.arterial",
        elementType: "geometry.stroke",
        stylers: [{ visibility: "on" }, { color: "#000000" }, { weight: 1.4 }]
      },
      {
        featureType: "road.local",
        elementType: "geometry.stroke",
        stylers: [{ visibility: "on" }, { color: "#000000" }, { weight: 0.9 }]
      }
    ]
  },
  context: {
    label: "Context",
    description: "Major roads plus locality and neighborhood labels.",
    styles: [
      { featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] },
      { featureType: "transit", stylers: [{ visibility: "off" }] },
      { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#FFFEF2" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#FFFEF2" }] },
      { featureType: "road", elementType: "geometry.fill", stylers: [{ visibility: "off" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "off" }] },
      {
        featureType: "road.highway",
        elementType: "geometry.stroke",
        stylers: [{ visibility: "on" }, { color: "#000000" }, { weight: 2.0 }]
      },
      {
        featureType: "road.arterial",
        elementType: "geometry.stroke",
        stylers: [{ visibility: "on" }, { color: "#000000" }, { weight: 1.4 }]
      },
      { featureType: "administrative.locality", elementType: "labels.text", stylers: [{ visibility: "on" }, { color: "#000000" }] },
      { featureType: "administrative.neighborhood", elementType: "labels.text", stylers: [{ visibility: "on" }, { color: "#000000" }] }
    ]
  }
};

const MAP_STYLE_ORDER: MapStylePresetKey[] = ["default", "ultra-minimal", "streets", "context"];
type CheckinState = "idle" | "requesting_location" | "challenging" | "verifying" | "success" | "failure";

function bboxString(bounds: google.maps.LatLngBounds): string {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  return `${sw.lng()},${sw.lat()},${ne.lng()},${ne.lat()}`;
}

type CheckinFailure = { title: string; detail?: string; nextStep?: string };

function getNumberDetail(details: Record<string, unknown>, key: string): number | undefined {
  const value = details[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatMeters(value?: number): string {
  if (value === undefined) return "—";
  return `${Math.round(value)}m`;
}

function formatSeconds(seconds: number): string {
  if (seconds <= 0) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function isMapStylePresetKey(value: string): value is MapStylePresetKey {
  return Object.prototype.hasOwnProperty.call(MAP_STYLE_PRESETS, value);
}

function getStoredMapStylePreset(): MapStylePresetKey {
  if (typeof window === "undefined") return "default";
  try {
    const stored = window.localStorage.getItem(MAP_STYLE_STORAGE_KEY);
    if (stored && isMapStylePresetKey(stored)) return stored;
  } catch {
    // Ignore storage failures.
  }
  return "default";
}

function persistMapStylePreset(preset: MapStylePresetKey) {
  try {
    window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, preset);
  } catch {
    // Ignore storage failures.
  }
}

export function MapRoute() {
  const [nodes, setNodes] = useState<NodePublic[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const [status, setStatus] = useState<string>("Starting…");
  const [nodesStatus, setNodesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [checkinToken, setCheckinToken] = useState<string | null>(null);
  const [checkinState, setCheckinState] = useState<CheckinState>("idle");
  const [checkinFailure, setCheckinFailure] = useState<CheckinFailure | null>(null);
  const [checkinAccuracyM, setCheckinAccuracyM] = useState<number | undefined>(undefined);
  const [checkinDistanceM, setCheckinDistanceM] = useState<number | undefined>(undefined);
  const [checkinRadiusM, setCheckinRadiusM] = useState<number | undefined>(undefined);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meStatus, setMeStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [sessionReady, setSessionReady] = useState(false);
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
  const [mapStylePreset, setMapStylePreset] = useState<MapStylePresetKey>(() => getStoredMapStylePreset());
  const nodeFetchAbortRef = useRef<AbortController | null>(null);
  const nodeFetchDebounceRef = useRef<number | null>(null);
  const lastBboxRef = useRef<string | undefined>(undefined);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const uploadQueue = useUploadQueue();

  useEffect(() => {
    let cancelled = false;
    ensureAnonymousSession()
      .then(() => {
        if (cancelled) return;
        setStatus("Ready");
        setSessionReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus(`Session error: ${String(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    const controller = new AbortController();
    setMeStatus("loading");
    getMe({ signal: controller.signal })
      .then((res) => {
        setMe(res);
        setMeStatus("ready");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMeStatus("error");
      });
    return () => controller.abort();
  }, [sessionReady]);

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

  useEffect(() => {
    persistMapStylePreset(mapStylePreset);
  }, [mapStylePreset]);

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      ...MAP_OPTIONS,
      styles: MAP_STYLE_PRESETS[mapStylePreset].styles
    }),
    [mapStylePreset]
  );

  const handleMapStyleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextPreset = event.target.value;
    if (isMapStylePresetKey(nextPreset)) setMapStylePreset(nextPreset);
  }, []);

  const scheduleNodesRefresh = useCallback((bbox?: string) => {
    lastBboxRef.current = bbox;
    if (nodeFetchDebounceRef.current !== null) window.clearTimeout(nodeFetchDebounceRef.current);

    nodeFetchDebounceRef.current = window.setTimeout(() => {
      nodeFetchAbortRef.current?.abort();
      const controller = new AbortController();
      nodeFetchAbortRef.current = controller;
      setNodesStatus("loading");
      setNodesError(null);

      listNodes(lastBboxRef.current, { signal: controller.signal })
        .then((res) => {
          setNodes(res.nodes);
          setSelectedNodeId((prev) => (prev && !res.nodes.some((n) => n.id === prev) ? null : prev));
          setNodesStatus("ready");
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          const message = e instanceof Error ? e.message : String(e);
          setNodesStatus("error");
          setNodesError(message);
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

  useEffect(() => {
    setCheckinToken(null);
    setCheckinState("idle");
    setCheckinFailure(null);
    setCheckinAccuracyM(undefined);
    setCheckinDistanceM(undefined);
    setCheckinRadiusM(undefined);
  }, [selectedNodeId]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline && checkinState !== "success") {
      setCheckinState("failure");
      setCheckinFailure({
        title: "Offline",
        detail: "Check-in requires an active connection.",
        nextStep: "Reconnect and retry check-in."
      });
    }
  }, [isOnline, checkinState]);

  const handleMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      const bounds = map.getBounds();
      scheduleNodesRefresh(bounds ? bboxString(bounds) : undefined);
    },
    [scheduleNodesRefresh]
  );

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
    setCheckinToken(null);
    setCheckinFailure(null);
    setCheckinAccuracyM(undefined);
    setCheckinDistanceM(undefined);
    setCheckinRadiusM(undefined);

    if (!navigator.onLine) {
      setCheckinState("failure");
      setCheckinFailure({
        title: "Offline",
        detail: "Check-in requires an active connection.",
        nextStep: "Reconnect and retry check-in."
      });
      return;
    }

    setCheckinState("requesting_location");
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10_000 })
      );
      setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setCheckinAccuracyM(pos.coords.accuracy);

      setCheckinState("challenging");
      const challenge = await createCheckinChallenge(selectedNode.id);

      setCheckinState("verifying");
      const res = await checkIn(selectedNode.id, {
        challenge_id: challenge.challenge_id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy
      });
      setCheckinToken(res.checkin_token);
      setCheckinFailure(null);
      setCheckinState("success");
    } catch (err) {
      if (!navigator.onLine) {
        setCheckinState("failure");
        setCheckinFailure({
          title: "Offline",
          detail: "Check-in requires an active connection.",
          nextStep: "Reconnect and retry check-in."
        });
        return;
      }

      if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "number") {
        const geoError = err as GeolocationPositionError;
        if (geoError.code === 1) {
          setCheckinState("failure");
          setCheckinFailure({
            title: "Location permission denied",
            detail: "Enable location access to check in.",
            nextStep: "Allow location access in your browser and retry."
          });
          return;
        }
        if (geoError.code === 2) {
          setCheckinState("failure");
          setCheckinFailure({
            title: "Location unavailable",
            detail: "We could not get a GPS fix.",
            nextStep: "Move to an open area and retry."
          });
          return;
        }
        if (geoError.code === 3) {
          setCheckinState("failure");
          setCheckinFailure({
            title: "Location timed out",
            detail: "GPS did not respond in time.",
            nextStep: "Retry check-in."
          });
          return;
        }
      }

      if (isApiError(err)) {
        const details = err.details ?? {};
        if (err.code === "location_accuracy_too_low") {
          const accuracy = getNumberDetail(details, "accuracy_m");
          const maxAllowed = getNumberDetail(details, "max_allowed_m");
          setCheckinAccuracyM((prev) => accuracy ?? prev);
          setCheckinFailure({
            title: "Location accuracy too low",
            detail: maxAllowed
              ? `Accuracy ${formatMeters(accuracy)} exceeds the ${formatMeters(maxAllowed)} limit.`
              : "Wait for a stronger GPS fix before retrying.",
            nextStep: "Stay still for a moment and retry."
          });
        } else if (err.code === "rank_locked") {
          const currentRank = getNumberDetail(details, "current_rank") ?? me?.rank;
          const requiredRank = getNumberDetail(details, "required_rank") ?? getNumberDetail(details, "node_min_rank");
          const detailParts: string[] = [];
          if (currentRank !== undefined) detailParts.push(`Your rank: ${currentRank}.`);
          if (requiredRank !== undefined) detailParts.push(`Unlock at rank ${requiredRank}.`);
          setCheckinFailure({
            title: "Node locked",
            detail: detailParts.length ? detailParts.join(" ") : err.message,
            nextStep: "Verify more captures to increase your rank."
          });
        } else if (err.code === "outside_geofence") {
          const distance = getNumberDetail(details, "distance_m");
          const radius = getNumberDetail(details, "radius_m");
          setCheckinDistanceM(distance);
          setCheckinRadiusM(radius);
          setCheckinFailure({
            title: "Not inside the zone",
            detail:
              distance !== undefined && radius !== undefined
                ? `You are ${formatMeters(distance)} from the center; zone radius is ${formatMeters(radius)}.`
                : "Move closer to the node and try again.",
            nextStep: "Use directions to get to the marker."
          });
        } else if (err.code === "challenge_used" || err.code === "challenge_expired" || err.code === "invalid_challenge") {
          setCheckinFailure({
            title: "Check-in expired",
            detail: "The check-in challenge is no longer valid.",
            nextStep: "Retry check-in."
          });
        } else if (err.code === "node_not_found") {
          setCheckinFailure({
            title: "Node not found",
            detail: "This node may have been removed.",
            nextStep: "Refresh nodes and try another."
          });
        } else {
          setCheckinFailure({
            title: "Check-in failed",
            detail: err.message,
            nextStep: "Retry check-in."
          });
        }
        setCheckinState("failure");
        return;
      }

      setCheckinState("failure");
      setCheckinFailure({
        title: "Check-in failed",
        detail: err instanceof Error ? err.message : String(err),
        nextStep: "Retry check-in."
      });
    }
  }

  function handleStartCapture() {
    if (!selectedNode || !checkinToken) return;
    navigate("/capture", {
      state: { node: selectedNode, checkinToken }
    });
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

  const nextUnlockLine = me ? formatNextUnlockLine(me) : null;
  const capsNotes = me ? formatRankCapsNotes(me.rank_breakdown) : [];

  return (
    <div className="layout">
      <div className="panel">
        <h1>Grounded Art (MVP scaffold)</h1>
        <div className="muted">{status}</div>

        {me ? (
          <div className="node">
            <div className="node-header">
              <div>
                <div className="muted">Current rank</div>
                <div>{me.rank}</div>
              </div>
            </div>
            {me.next_unlock ? (
              <>
                <div className="muted">Next unlock at rank {me.next_unlock.min_rank}.</div>
                {nextUnlockLine ? <div className="muted">{nextUnlockLine}</div> : null}
              </>
            ) : (
              <div className="muted">Top tier unlocked.</div>
            )}
            {capsNotes.map((note) => (
              <div key={note} className="muted">
                {note}
              </div>
            ))}
          </div>
        ) : meStatus === "loading" ? (
          <div className="muted" style={{ marginTop: 8 }}>
            Loading rank…
          </div>
        ) : meStatus === "error" ? (
          <div className="muted" style={{ marginTop: 8 }}>
            Rank unavailable.
          </div>
        ) : null}

        <details className="settings">
          <summary>Global settings</summary>
          <div className="settings-body">
            <div className="settings-group">
              <div className="settings-label">Map style preset</div>
              <div className="settings-options">
                {MAP_STYLE_ORDER.map((presetKey) => (
                  <label key={presetKey} className="settings-option">
                    <input
                      type="radio"
                      name="map-style-preset"
                      value={presetKey}
                      checked={mapStylePreset === presetKey}
                      onChange={handleMapStyleChange}
                    />
                    <span>{MAP_STYLE_PRESETS[presetKey].label}</span>
                  </label>
                ))}
              </div>
              <div className="muted">{MAP_STYLE_PRESETS[mapStylePreset].description}</div>
            </div>
          </div>
        </details>

        {uploadQueue.persistenceError ? (
          <div className="alert">
            <div>Upload persistence unavailable</div>
            <div className="muted">{uploadQueue.persistenceError}</div>
          </div>
        ) : null}

        {uploadQueue.items.length ? (
          <div className="node">
            <div className="node-header">
              <div>
                <div className="muted">Pending uploads</div>
                <div>
                  {uploadQueue.uploadingCount ? `${uploadQueue.uploadingCount} uploading` : null}
                  {uploadQueue.uploadingCount && (uploadQueue.pendingCount || uploadQueue.failedCount) ? " • " : null}
                  {uploadQueue.pendingCount ? `${uploadQueue.pendingCount} queued` : null}
                  {uploadQueue.pendingCount && uploadQueue.failedCount ? " • " : null}
                  {uploadQueue.failedCount ? `${uploadQueue.failedCount} failed` : null}
                </div>
              </div>
              <div className="node-actions">
                <button
                  onClick={() => uploadQueue.items.filter((i) => i.status === "failed").forEach((i) => void uploadQueue.retryNow(i.captureId))}
                  disabled={!uploadQueue.failedCount}
                >
                  Retry failed
                </button>
              </div>
            </div>
            {!isOnline ? <div className="muted" style={{ marginTop: 4 }}>Offline — uploads resume when you reconnect.</div> : null}
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {uploadQueue.items.map((item) => {
                const nextAttemptMs = item.nextAttemptAt ? Date.parse(item.nextAttemptAt) : null;
                const secondsUntilRetry =
                  nextAttemptMs && Number.isFinite(nextAttemptMs) ? Math.max(0, Math.round((nextAttemptMs - Date.now()) / 1000)) : null;
                const progressPct =
                  item.progress?.total && item.progress.total > 0
                    ? Math.min(100, Math.round((item.progress.loaded / item.progress.total) * 100))
                    : null;

                return (
                  <div key={item.captureId} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <div>
                      <div>Capture {item.captureId.slice(0, 8)}…</div>
                      <div className="muted">
                        {item.status === "uploading"
                          ? progressPct !== null
                            ? `Uploading (${progressPct}%)`
                            : "Uploading"
                          : item.status === "pending"
                            ? secondsUntilRetry && secondsUntilRetry > 0
                              ? `Retrying in ${formatSeconds(secondsUntilRetry)}`
                              : "Queued"
                            : "Failed"}
                        {item.lastError?.code ? ` • ${item.lastError.code}` : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {item.status === "failed" ? (
                        <button onClick={() => void uploadQueue.retryNow(item.captureId)} disabled={!isOnline}>
                          Retry
                        </button>
                      ) : null}
                      <button onClick={() => void uploadQueue.remove(item.captureId)}>Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="node">
          <div className="node-header">
            <div>
              <div className="muted">Nodes in view</div>
              <div>
                {nodesStatus === "loading"
                  ? "Loading nodes…"
                  : nodesStatus === "error"
                  ? "Unable to load"
                  : nodes.length}
              </div>
            </div>
            <div className="node-actions">
              <button onClick={() => scheduleNodesRefresh(lastBboxRef.current)} disabled={nodesStatus === "loading"}>
                {nodesStatus === "error" ? "Retry" : "Refresh"}
              </button>
            </div>
          </div>
          {nodesStatus === "loading" ? <div className="muted">Fetching the latest nodes…</div> : null}
          {nodesStatus === "ready" && nodes.length === 0 ? (
            <div className="muted">No nodes in this viewport yet.</div>
          ) : null}
          {nodesStatus === "error" ? (
            <div className="alert">
              <div>Could not load nodes.</div>
              <div className="muted">{nodesError ?? "Unknown error"}</div>
              <button onClick={() => scheduleNodesRefresh(lastBboxRef.current)}>Try again</button>
            </div>
          ) : null}
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
              <button
                onClick={handleCheckIn}
                disabled={
                  !isOnline ||
                  checkinState === "requesting_location" ||
                  checkinState === "challenging" ||
                  checkinState === "verifying"
                }
              >
                {checkinState === "requesting_location"
                  ? "Locating…"
                  : checkinState === "challenging"
                  ? "Creating challenge…"
                  : checkinState === "verifying"
                  ? "Verifying…"
                  : "Check in"}
              </button>
              <button onClick={handleRequestDirections} disabled={!isLoaded}>
                Directions
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="muted">Check-in status</div>
              <div>
                {checkinState === "idle"
                  ? "Not checked in yet."
                  : checkinState === "success"
                  ? "Checked in."
                  : checkinState === "failure"
                  ? "Check-in failed."
                  : "Checking in…"}
              </div>
              <div className="muted" style={{ marginTop: 4 }}>
                Accuracy: {formatMeters(checkinAccuracyM)} | Distance: {formatMeters(checkinDistanceM)} | Radius:{" "}
                {formatMeters(checkinRadiusM)}
              </div>
              {checkinFailure ? (
                <div className="alert" style={{ marginTop: 8 }}>
                  <div>{checkinFailure.title}</div>
                  {checkinFailure.detail ? <div className="muted">{checkinFailure.detail}</div> : null}
                  {checkinFailure.nextStep ? <div className="muted">{checkinFailure.nextStep}</div> : null}
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={handleCheckIn} disabled={!isOnline}>
                      Retry check-in
                    </button>
                    <button onClick={handleRequestDirections} disabled={!isLoaded}>
                      Get directions
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Token: {checkinToken ? `${checkinToken.slice(0, 8)}…` : "none"} | Directions:{" "}
              {directionsResult ? "ready" : "not requested"}
            </div>
            <div style={{ marginTop: 8 }}>
              <button onClick={handleStartCapture} disabled={!checkinToken}>
                Take photo
              </button>
            </div>
          </div>
        ) : (
          <div className="node">
            <div className="muted">Select a node marker to check in.</div>
          </div>
        )}
      </div>

      <div className="map-area">
        {!googleMapsApiKey ? (
          <div className="muted" style={{ padding: 12 }}>
            Set VITE_GOOGLE_MAPS_API_KEY in .env to load the map.
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
            options={mapOptions}
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
