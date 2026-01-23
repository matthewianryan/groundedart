import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  DirectionsService,
  GoogleMap,
  Marker,
  useJsApiLoader
} from "@react-google-maps/api";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ensureAnonymousSession } from "../auth/session";
import { isApiError } from "../api/http";
import { createCheckinChallenge, checkIn } from "../features/checkin/api";
import { useUploadQueue } from "../features/captures/useUploadQueue";
import { formatNextUnlockLine, formatRankCapsNotes } from "../features/me/copy";
import { getMe } from "../features/me/api";
import type { MeResponse } from "../features/me/types";
import { listNodes } from "../features/nodes/api";
import type { NodePublic } from "../features/nodes/types";
import { Button, Card, Badge, Select, Alert } from "../components/ui";
import { slideInLeft, fadeInUp, staggerContainer, staggerItem, defaultTransition } from "../utils/animations";

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
  const [isPanelVisible, setIsPanelVisible] = useState<boolean>(true);
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
    <div className={`layout ${isPanelVisible ? "" : "layout-panel-hidden"}`}>
      <AnimatePresence>
        {isPanelVisible && (
          <motion.div
            className="panel"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={slideInLeft}
            transition={defaultTransition}
          >
            <Card variant="light" padding="sm" className="mb-3">
              <div className="flex justify-between items-start gap-4 mb-2">
                <h1 className="text-base md:text-lg font-bold m-0 text-grounded-charcoal dark:text-grounded-parchment">Grounded Art</h1>
                <Button
                  variant="light"
                  size="sm"
                  onClick={() => setIsPanelVisible(false)}
                  className="!p-2 !min-w-0"
                  title="Hide panel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
              <div className="text-muted text-xs">{status}</div>
            </Card>

            {me ? (
              <motion.div
                initial="initial"
                animate="animate"
                variants={fadeInUp}
                transition={defaultTransition}
              >
                <Card variant="light" padding="sm" className="mb-3">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <div className="text-muted text-xs uppercase tracking-wide mb-1">Current rank</div>
                      <Badge variant="copper" size="md" className="text-base">
                        {me.rank}
                      </Badge>
                    </div>
                  </div>
                  {me.next_unlock ? (
                    <div className="space-y-1">
                      <div className="text-muted text-sm">Next unlock at rank {me.next_unlock.min_rank}.</div>
                      {nextUnlockLine ? <div className="text-muted text-sm">{nextUnlockLine}</div> : null}
                    </div>
                  ) : (
                    <div className="text-muted text-sm">Top tier unlocked.</div>
                  )}
                  {capsNotes.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {capsNotes.map((note) => (
                        <div key={note} className="text-muted text-sm">
                          {note}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </motion.div>
            ) : meStatus === "loading" ? (
              <Card variant="light" padding="sm" className="mb-3">
                <div className="text-muted text-sm">Loading rank…</div>
              </Card>
            ) : meStatus === "error" ? (
              <Card variant="light" padding="sm" className="mb-3">
                <div className="text-muted text-sm">Rank unavailable.</div>
              </Card>
            ) : null}

            <motion.div
              initial="initial"
              animate="animate"
              variants={fadeInUp}
              transition={{ ...defaultTransition, delay: 0.1 }}
            >
              <Card variant="light" padding="sm" className="mb-3">
                <details className="group">
                  <summary className="cursor-pointer list-none flex items-center justify-between text-xs uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Global settings
                    </span>
                    <svg
                      className="w-3.5 h-3.5 transition-transform duration-300 group-open:rotate-180 text-grounded-charcoal/60 dark:text-grounded-parchment/60"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div>
                      <Select
                        label="Map style preset"
                        value={mapStylePreset}
                        onChange={(e) => {
                          const nextPreset = e.target.value;
                          if (isMapStylePresetKey(nextPreset)) setMapStylePreset(nextPreset);
                        }}
                        options={MAP_STYLE_ORDER.map((presetKey) => ({
                          value: presetKey,
                          label: MAP_STYLE_PRESETS[presetKey].label
                        }))}
                        helperText={MAP_STYLE_PRESETS[mapStylePreset].description}
                      />
                    </div>
                  </div>
                </details>
              </Card>
            </motion.div>

            {uploadQueue.persistenceError ? (
              <motion.div
                initial="initial"
                animate="animate"
                variants={fadeInUp}
                transition={{ ...defaultTransition, delay: 0.2 }}
                className="mb-4"
              >
                <Alert variant="warning" title="Upload persistence unavailable">
                  {uploadQueue.persistenceError}
                </Alert>
              </motion.div>
            ) : null}

            {uploadQueue.items.length ? (
              <motion.div
                initial="initial"
                animate="animate"
                variants={fadeInUp}
                transition={{ ...defaultTransition, delay: 0.2 }}
                className="mb-4"
              >
                <Card variant="light" padding="sm" className="mb-3">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <div>
                      <div className="text-muted text-xs uppercase tracking-wide mb-1">Pending uploads</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {uploadQueue.uploadingCount ? (
                          <Badge variant="info" size="sm">
                            {uploadQueue.uploadingCount} uploading
                          </Badge>
                        ) : null}
                        {uploadQueue.pendingCount ? (
                          <Badge variant="default" size="sm">
                            {uploadQueue.pendingCount} queued
                          </Badge>
                        ) : null}
                        {uploadQueue.failedCount ? (
                          <Badge variant="error" size="sm">
                            {uploadQueue.failedCount} failed
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      variant="light"
                      size="sm"
                      onClick={() => uploadQueue.items.filter((i) => i.status === "failed").forEach((i) => void uploadQueue.retryNow(i.captureId))}
                      disabled={!uploadQueue.failedCount || !isOnline}
                    >
                      Retry failed
                    </Button>
                  </div>
                  {!isOnline ? (
                    <div className="text-muted text-sm mb-3">Offline — uploads resume when you reconnect.</div>
                  ) : null}
                  <div className="space-y-3">
                    {uploadQueue.items.map((item, index) => {
                      const nextAttemptMs = item.nextAttemptAt ? Date.parse(item.nextAttemptAt) : null;
                      const secondsUntilRetry =
                        nextAttemptMs && Number.isFinite(nextAttemptMs) ? Math.max(0, Math.round((nextAttemptMs - Date.now()) / 1000)) : null;
                      const progressPct =
                        item.progress?.total && item.progress.total > 0
                          ? Math.min(100, Math.round((item.progress.loaded / item.progress.total) * 100))
                          : null;

                      return (
                        <motion.div
                          key={item.captureId}
                          initial="initial"
                          animate="animate"
                          variants={staggerItem}
                          transition={{ ...defaultTransition, delay: index * 0.05 }}
                        >
                          <Card variant="light" padding="sm" className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium mb-1">Capture {item.captureId.slice(0, 8)}…</div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {item.status === "uploading" ? (
                                  <>
                                    <Badge variant="info" size="sm">
                                      {progressPct !== null ? `Uploading (${progressPct}%)` : "Uploading"}
                                    </Badge>
                                    {progressPct !== null && (
                                      <div className="flex-1 min-w-[100px] h-2 bg-grounded-charcoal/10 dark:bg-grounded-parchment/10 rounded-full overflow-hidden">
                                        <motion.div
                                          className="h-full bg-grounded-copper"
                                          initial={{ width: 0 }}
                                          animate={{ width: `${progressPct}%` }}
                                          transition={{ duration: 0.3 }}
                                        />
                                      </div>
                                    )}
                                  </>
                                ) : item.status === "pending" ? (
                                  <Badge variant="default" size="sm">
                                    {secondsUntilRetry && secondsUntilRetry > 0
                                      ? `Retrying in ${formatSeconds(secondsUntilRetry)}`
                                      : "Queued"}
                                  </Badge>
                                ) : (
                                  <Badge variant="error" size="sm">
                                    Failed
                                  </Badge>
                                )}
                                {item.lastError?.code ? (
                                  <span className="text-muted text-xs">• {item.lastError.code}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.status === "failed" ? (
                                <Button
                                  variant="light"
                                  size="sm"
                                  onClick={() => void uploadQueue.retryNow(item.captureId)}
                                  disabled={!isOnline}
                                >
                                  Retry
                                </Button>
                              ) : null}
                              <Button
                                variant="light"
                                size="sm"
                                onClick={() => void uploadQueue.remove(item.captureId)}
                              >
                                Remove
                              </Button>
                            </div>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            ) : null}

            <motion.div
              initial="initial"
              animate="animate"
              variants={fadeInUp}
              transition={{ ...defaultTransition, delay: 0.3 }}
              className="mb-4"
            >
              <Card variant="light" padding="sm" className="mb-3">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div>
                    <div className="text-muted text-xs uppercase tracking-wide mb-1">Nodes in view</div>
                    <div className="text-sm font-semibold text-grounded-charcoal dark:text-grounded-parchment">
                      {nodesStatus === "loading"
                        ? "Loading nodes…"
                        : nodesStatus === "error"
                        ? "Unable to load"
                        : nodes.length}
                    </div>
                  </div>
                  <Button
                    variant="light"
                    size="sm"
                    onClick={() => scheduleNodesRefresh(lastBboxRef.current)}
                    disabled={nodesStatus === "loading"}
                    isLoading={nodesStatus === "loading"}
                  >
                    {nodesStatus === "error" ? "Retry" : "Refresh"}
                  </Button>
                </div>
                {nodesStatus === "loading" ? (
                  <div className="text-muted text-sm">Fetching the latest nodes…</div>
                ) : null}
                {nodesStatus === "ready" && nodes.length === 0 ? (
                  <div className="text-muted text-sm">No nodes in this viewport yet.</div>
                ) : null}
                {nodesStatus === "error" ? (
                  <Alert variant="error" title="Could not load nodes">
                    <div className="text-xs mb-3">{nodesError ?? "Unknown error"}</div>
                    <Button
                      variant="light"
                      size="sm"
                      onClick={() => scheduleNodesRefresh(lastBboxRef.current)}
                    >
                      Try again
                    </Button>
                  </Alert>
                ) : null}
              </Card>
            </motion.div>

            {selectedNode ? (
              <motion.div
                initial="initial"
                animate="animate"
                variants={fadeInUp}
                transition={{ ...defaultTransition, delay: 0.4 }}
                className="mb-4"
              >
                <Card variant="light" padding="sm" className="mb-3">
                  <div className="mb-3">
                    <h2 className="text-sm font-semibold mb-1 text-grounded-charcoal dark:text-grounded-parchment">{selectedNode.name}</h2>
                    <Badge variant="default" size="sm" className="mb-2">
                      {selectedNode.category}
                    </Badge>
                    {selectedNode.description ? (
                      <div className="text-muted text-xs mt-2">{selectedNode.description}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Button variant="light" size="sm" onClick={handleOpenDetails}>
                      <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Open detail
                    </Button>
                    <Button
                      variant="copper"
                      size="sm"
                      onClick={handleCheckIn}
                      disabled={
                        !isOnline ||
                        checkinState === "requesting_location" ||
                        checkinState === "challenging" ||
                        checkinState === "verifying"
                      }
                      isLoading={
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
                        : (
                          <>
                            <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Check in
                          </>
                        )}
                    </Button>
                    <Button variant="light" size="sm" onClick={handleRequestDirections} disabled={!isLoaded}>
                      <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      Directions
                    </Button>
                  </div>
                  <div className="mb-4">
                    <div className="text-muted text-xs uppercase tracking-wide mb-2">Check-in status</div>
                    <div className="mb-2">
                      {checkinState === "idle" ? (
                        <Badge variant="default" size="sm">Not checked in yet</Badge>
                      ) : checkinState === "success" ? (
                        <Badge variant="success" size="sm">Checked in</Badge>
                      ) : checkinState === "failure" ? (
                        <Badge variant="error" size="sm">Check-in failed</Badge>
                      ) : (
                        <Badge variant="info" size="sm">Checking in…</Badge>
                      )}
                    </div>
                    <div className="text-muted text-xs space-y-1">
                      <div>Accuracy: {formatMeters(checkinAccuracyM)}</div>
                      <div>Distance: {formatMeters(checkinDistanceM)}</div>
                      <div>Radius: {formatMeters(checkinRadiusM)}</div>
                    </div>
                    {checkinFailure ? (
                      <div className="mt-4">
                        <Alert variant="error" title={checkinFailure.title}>
                          {checkinFailure.detail && <div className="text-xs mb-2">{checkinFailure.detail}</div>}
                          {checkinFailure.nextStep && <div className="text-xs mb-3">{checkinFailure.nextStep}</div>}
                          <div className="flex flex-wrap gap-2">
                            <Button variant="copper" size="sm" onClick={handleCheckIn} disabled={!isOnline}>
                              Retry check-in
                            </Button>
                            <Button variant="light" size="sm" onClick={handleRequestDirections} disabled={!isLoaded}>
                              Get directions
                            </Button>
                          </div>
                        </Alert>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-muted text-xs mb-4 space-y-1">
                    <div>Token: {checkinToken ? `${checkinToken.slice(0, 8)}…` : "none"}</div>
                    <div>Directions: {directionsResult ? "ready" : "not requested"}</div>
                  </div>
                  <Button
                    variant="copper"
                    size="md"
                    onClick={handleStartCapture}
                    disabled={!checkinToken}
                    fullWidth
                  >
                    <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Take photo
                  </Button>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                initial="initial"
                animate="animate"
                variants={fadeInUp}
                transition={{ ...defaultTransition, delay: 0.4 }}
                className="mb-3"
              >
                <Card variant="light" padding="sm">
                  <div className="text-muted text-sm text-center py-3">Select a node marker to check in.</div>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="map-area">
        <AnimatePresence>
          {!isPanelVisible && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={defaultTransition}
              className="absolute top-3 left-3 z-[1000]"
            >
              <Button
                variant="light"
                size="md"
                onClick={() => setIsPanelVisible(true)}
                className="shadow-lg"
              >
                <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Show Panel
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
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
