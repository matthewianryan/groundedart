import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  DirectionsService,
  GoogleMap,
  Marker,
  OverlayView,
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
import type { RankUpUnlocked, ToastNotice } from "../features/me/RankUpUi";
import { RankBadge, RankUpOverlay, ToastStack, type RankUpEvent } from "../features/me/RankUpUi";
import { listNotifications, markNotificationRead } from "../features/notifications/api";
import type { NotificationPublic } from "../features/notifications/types";
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

const MISSING_FIELD_LABELS: Record<string, string> = {
  attribution_artist_name: "artist name",
  attribution_artwork_title: "artwork title",
  attribution_source: "attribution source",
  rights_basis: "rights basis",
  rights_attested_at: "rights attestation"
};

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

function formatNotificationTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatMissingFields(fields?: string[] | null): string | null {
  if (!fields?.length) return null;
  const labels = fields.map((field) => MISSING_FIELD_LABELS[field] ?? field);
  return labels.join(", ");
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
  const [notifications, setNotifications] = useState<NotificationPublic[]>([]);
  const [notificationsStatus, setNotificationsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
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
  const demoMode = useMemo(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).has("demo") : false), []);
  const [demoRank, setDemoRank] = useState<number | null>(null);
  const prevDemoRankRef = useRef<number | null>(null);

  const meFetchAbortRef = useRef<AbortController | null>(null);
  const meRef = useRef<MeResponse | null>(null);
  const prevMeRef = useRef<MeResponse | null>(null);

  const [rankPulseKey, setRankPulseKey] = useState(0);
  const [rankUpEvent, setRankUpEvent] = useState<RankUpEvent | null>(null);
  const rankUpDismissTimeoutRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const celebrateNodesOnNextRefreshRef = useRef(false);
  const prevNodesRef = useRef<NodePublic[] | null>(null);
  const [mapRipples, setMapRipples] = useState<Array<{ id: string; position: google.maps.LatLngLiteral }>>([]);

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
    meRef.current = me;
  }, [me]);

  const refreshMe = useCallback(
    (showLoading: boolean) => {
      if (!sessionReady) return;
      meFetchAbortRef.current?.abort();
      const controller = new AbortController();
      meFetchAbortRef.current = controller;

      if (showLoading) setMeStatus("loading");
      getMe({ signal: controller.signal })
        .then((res) => {
          setMe(res);
          setMeStatus("ready");
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (!meRef.current) setMeStatus("error");
        });
    },
    [sessionReady]
  );

  useEffect(() => {
    if (!sessionReady) return;
    refreshMe(true);
    const intervalId = window.setInterval(() => refreshMe(false), 30_000);
    return () => {
      window.clearInterval(intervalId);
      meFetchAbortRef.current?.abort();
    };
  }, [refreshMe, sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    const controller = new AbortController();
    setNotificationsStatus("loading");
    setNotificationsError(null);
    listNotifications({ signal: controller.signal })
      .then((res) => {
        setNotifications(res.notifications);
        setNotificationsStatus("ready");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setNotificationsStatus("error");
        setNotificationsError(err instanceof Error ? err.message : String(err));
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
          celebrateNodesOnNextRefreshRef.current = false;
          const message = e instanceof Error ? e.message : String(e);
          setNodesStatus("error");
          setNodesError(message);
          setStatus(`Nodes error: ${String(e)}`);
        });
    }, NODE_FETCH_DEBOUNCE_MS);
  }, []);

  const dismissRankUp = useCallback(() => {
    if (rankUpDismissTimeoutRef.current !== null) window.clearTimeout(rankUpDismissTimeoutRef.current);
    rankUpDismissTimeoutRef.current = null;
    setRankUpEvent(null);
  }, []);

  const pushToast = useCallback((title: string, lines: string[], ttlMs = 6000) => {
    const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, title, lines }]);
    const timeoutId = window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttlMs);
    timeoutsRef.current.push(timeoutId);
  }, []);

  const addMapRipples = useCallback((items: Array<{ id: string; lat: number; lng: number }>) => {
    items.forEach((item) => {
      const rippleId = `ripple_${item.id}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setMapRipples((prev) => [...prev, { id: rippleId, position: { lat: item.lat, lng: item.lng } }]);
      const timeoutId = window.setTimeout(() => setMapRipples((prev) => prev.filter((r) => r.id !== rippleId)), 1800);
      timeoutsRef.current.push(timeoutId);
    });
  }, []);

  const triggerRankUp = useCallback(
    (fromRank: number, toRank: number, unlocked: RankUpUnlocked | null) => {
      setRankPulseKey((prev) => prev + 1);
      const eventId = `rankup_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setRankUpEvent({ id: eventId, fromRank, toRank, unlocked });

      if (unlocked) {
        const lines = [unlocked.summary, ...unlocked.unlocks].filter(Boolean);
        pushToast("Unlocked", lines);
      } else {
        pushToast("Rank up", [`Rank ${fromRank} → ${toRank}`]);
      }

      celebrateNodesOnNextRefreshRef.current = true;
      scheduleNodesRefresh(lastBboxRef.current);
    },
    [pushToast, scheduleNodesRefresh]
  );

  useEffect(() => {
    if (!rankUpEvent) return;
    if (rankUpDismissTimeoutRef.current !== null) window.clearTimeout(rankUpDismissTimeoutRef.current);
    rankUpDismissTimeoutRef.current = window.setTimeout(() => dismissRankUp(), 4500);
    return () => {
      if (rankUpDismissTimeoutRef.current !== null) window.clearTimeout(rankUpDismissTimeoutRef.current);
      rankUpDismissTimeoutRef.current = null;
    };
  }, [dismissRankUp, rankUpEvent]);

  useEffect(() => {
    const prev = prevMeRef.current;
    if (demoRank !== null) {
      prevMeRef.current = me;
      return;
    }
    if (me && prev && me.rank > prev.rank) {
      const unlocked =
        prev.next_unlock && prev.rank < prev.next_unlock.min_rank && me.rank >= prev.next_unlock.min_rank
          ? { summary: prev.next_unlock.summary, unlocks: prev.next_unlock.unlocks }
          : null;
      triggerRankUp(prev.rank, me.rank, unlocked);
    }
    prevMeRef.current = me;
  }, [demoRank, me, triggerRankUp]);

  useEffect(() => {
    if (!demoMode) {
      prevDemoRankRef.current = null;
      return;
    }
    if (demoRank === null) {
      prevDemoRankRef.current = null;
      return;
    }
    const fallback = me?.rank ?? demoRank;
    const prevRank = prevDemoRankRef.current ?? fallback;
    if (demoRank <= prevRank) {
      prevDemoRankRef.current = demoRank;
      return;
    }
    const unlocked =
      me?.next_unlock && prevRank < me.next_unlock.min_rank && demoRank >= me.next_unlock.min_rank
        ? { summary: me.next_unlock.summary, unlocks: me.next_unlock.unlocks }
        : null;
    triggerRankUp(prevRank, demoRank, unlocked);
    prevDemoRankRef.current = demoRank;
  }, [demoMode, demoRank, me?.next_unlock, me?.rank, prevDemoRankRef, triggerRankUp]);

  useEffect(() => {
    if (!celebrateNodesOnNextRefreshRef.current) {
      prevNodesRef.current = nodes;
      return;
    }

    const prevNodes = prevNodesRef.current ?? [];
    const prevIds = new Set(prevNodes.map((n) => n.id));
    const added = nodes.filter((n) => !prevIds.has(n.id));
    if (added.length) {
      addMapRipples(added);
      pushToast("New nodes available", added.slice(0, 5).map((n) => n.name));
    }
    celebrateNodesOnNextRefreshRef.current = false;
    prevNodesRef.current = nodes;
  }, [addMapRipples, nodes, pushToast]);

  useEffect(() => {
    return () => {
      if (rankUpDismissTimeoutRef.current !== null) window.clearTimeout(rankUpDismissTimeoutRef.current);
      timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutsRef.current = [];
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

  async function handleRefreshNotifications() {
    setNotificationsStatus("loading");
    setNotificationsError(null);
    try {
      const res = await listNotifications();
      setNotifications(res.notifications);
      setNotificationsStatus("ready");
    } catch (err) {
      setNotificationsStatus("error");
      setNotificationsError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    try {
      const updated = await markNotificationRead(notificationId);
      setNotifications((prev) => prev.map((item) => (item.id === notificationId ? updated : item)));
    } catch {
      // ignore
    }
  }

  const viewMe = useMemo(() => (me && demoRank !== null ? { ...me, rank: demoRank } : me), [demoRank, me]);
  const nextUnlockLine = viewMe ? formatNextUnlockLine(viewMe) : null;
  const capsNotes = viewMe ? formatRankCapsNotes(viewMe.rank_breakdown) : [];
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  return (
    <div className="layout">
      <div className="panel">
        <h1>Grounded Art (MVP scaffold)</h1>
        <div className="muted">{status}</div>

        {viewMe ? (
          <div className="node">
            <div className="node-header">
              <RankBadge rank={viewMe.rank} pulseKey={rankPulseKey} />
              <div className="node-actions">
                <button type="button" onClick={() => refreshMe(true)} disabled={meStatus === "loading"}>
                  Refresh rank
                </button>
              </div>
            </div>
            {demoRank !== null ? (
              <div className="muted" style={{ marginTop: 6 }}>
                Demo override: displaying rank {demoRank}.
              </div>
            ) : null}
            {viewMe.next_unlock ? (
              <>
                <div className="muted">Next unlock at rank {viewMe.next_unlock.min_rank}.</div>
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

        {demoMode ? (
          <details className="settings">
            <summary>Demo controls</summary>
            <div className="settings-body">
              <div className="settings-group">
                <div className="settings-label">Rank simulation</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setDemoRank((prev) => (prev ?? viewMe?.rank ?? 0) + 1)}
                    disabled={!viewMe}
                  >
                    Rank up (+1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoRank(viewMe?.next_unlock?.min_rank ?? null)}
                    disabled={!viewMe?.next_unlock}
                  >
                    Jump to next unlock
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const sample = nodes.slice(0, 3);
                      addMapRipples(sample);
                      pushToast("New nodes available", sample.map((n) => n.name));
                    }}
                    disabled={!nodes.length}
                  >
                    Simulate node splash
                  </button>
                  <button type="button" onClick={() => setDemoRank(null)} disabled={demoRank === null}>
                    Clear demo
                  </button>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Tip: open `?demo=1` to show these controls.
                </div>
              </div>
            </div>
          </details>
        ) : null}

        <div className="node">
          <div className="node-header">
            <div>
              <div className="muted">Notifications</div>
              <div>
                {notificationsStatus === "loading"
                  ? "Loading…"
                  : notificationsStatus === "error"
                    ? "Unavailable"
                    : unreadCount
                      ? `${unreadCount} unread`
                      : "All caught up"}
              </div>
            </div>
            <div className="node-actions">
              <button onClick={handleRefreshNotifications} disabled={notificationsStatus === "loading"}>
                {notificationsStatus === "error" ? "Retry" : "Refresh"}
              </button>
            </div>
          </div>
          {notificationsStatus === "error" ? (
            <div className="alert">
              <div>Could not load notifications.</div>
              <div className="muted">{notificationsError ?? "Unknown error"}</div>
            </div>
          ) : null}
          {notificationsStatus !== "loading" && notifications.length === 0 ? (
            <div className="muted">No notifications yet.</div>
          ) : null}
          {notifications.length ? (
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {notifications.map((notification) => {
                const missing = formatMissingFields(notification.details?.missing_fields);
                return (
                  <div key={notification.id} style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <strong>{notification.title}</strong>
                        <div className="muted">{formatNotificationTimestamp(notification.created_at)}</div>
                      </div>
                      <div>
                        <button
                          onClick={() => void handleMarkNotificationRead(notification.id)}
                          disabled={Boolean(notification.read_at)}
                        >
                          {notification.read_at ? "Read" : "Mark read"}
                        </button>
                      </div>
                    </div>
                    {notification.body ? <div className="muted">{notification.body}</div> : null}
                    {missing ? <div className="muted">Missing: {missing}</div> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

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
            {mapRipples.map((ripple) => (
              <OverlayView
                key={ripple.id}
                position={ripple.position}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              >
                <div className="ga-map-ripple" />
              </OverlayView>
            ))}
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

      <RankUpOverlay event={rankUpEvent} onDismiss={dismissRankUp} />
      <ToastStack toasts={toasts} onDismiss={(toastId) => setToasts((prev) => prev.filter((t) => t.id !== toastId))} />
    </div>
  );
}
