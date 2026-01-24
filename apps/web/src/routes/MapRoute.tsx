import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  DirectionsService,
  GoogleMap,
  type Libraries,
  Marker,
  OverlayView,
  useJsApiLoader
} from "@react-google-maps/api";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { resetDeviceId } from "../auth/device";
import { ensureAnonymousSession } from "../auth/session";
import { isApiError } from "../api/http";
import { createCheckinChallenge, checkIn } from "../features/checkin/api";
import { clearActiveCaptureDraft } from "../features/captures/captureDraftStore";
import {
  CAPTURE_UPLOADED_EVENT,
  CAPTURE_VERIFIED_EVENT,
  type CaptureUploadedEventDetail,
  type CaptureVerifiedEventDetail
} from "../features/captures/uploadEvents";
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
import { Button, Card, Badge, Select, Alert } from "../components/ui";
import { slideInLeft, fadeInUp, staggerContainer, staggerItem, defaultTransition } from "../utils/animations";

const NODE_FETCH_DEBOUNCE_MS = 250;
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: -33.9249, lng: 18.4241 };
const MAP_CONTAINER_STYLE = { height: "100%", width: "100%" };
const GOOGLE_MAPS_LIBRARIES: Libraries = [];
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: "greedy"
};
const MAP_STYLE_STORAGE_KEY = "groundedart.mapStylePreset";
const DEMO_ENABLED_STORAGE_KEY = "groundedart.demo.enabled";
const DEMO_ADMIN_TOKEN_STORAGE_KEY = "groundedart.demo.adminToken";
const DEMO_AUTO_VERIFY_STORAGE_KEY = "groundedart.demo.autoVerify";
const DEMO_PUPPET_ENABLED_STORAGE_KEY = "groundedart.demo.puppetEnabled";
const DEMO_PUPPET_LAT_STORAGE_KEY = "groundedart.demo.puppetLat";
const DEMO_PUPPET_LNG_STORAGE_KEY = "groundedart.demo.puppetLng";
const DEMO_PUPPET_ACCURACY_STORAGE_KEY = "groundedart.demo.puppetAccuracyM";
const DEMO_CLICK_TO_MOVE_STORAGE_KEY = "groundedart.demo.clickToMove";

const DEMO_MODE_ENV = import.meta.env.VITE_DEMO_MODE as string | undefined;
const DEMO_PUPPET_ENABLED_ENV = import.meta.env.VITE_DEMO_PUPPET_ENABLED as string | undefined;
const DEMO_PUPPET_LAT_ENV = import.meta.env.VITE_DEMO_PUPPET_LAT as string | undefined;
const DEMO_PUPPET_LNG_ENV = import.meta.env.VITE_DEMO_PUPPET_LNG as string | undefined;
const DEMO_DEVICE_ID_ENV = import.meta.env.VITE_DEMO_DEVICE_ID as string | undefined;
const DEMO_AUTO_VERIFY_ENV = import.meta.env.VITE_DEMO_AUTO_VERIFY as string | undefined;
const DEMO_PUPPET_ACCURACY_ENV = import.meta.env.VITE_DEMO_PUPPET_ACCURACY_M as string | undefined;
const DEMO_CLICK_TO_MOVE_ENV = import.meta.env.VITE_DEMO_CLICK_TO_MOVE as string | undefined;

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

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function readStoredBool(key: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    // ignore
  }
  return fallback;
}

function readEnvBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function readEnvNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readStoredNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    // ignore
  }
  return fallback;
}

function readStoredString(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    // ignore
  }
  return fallback;
}

function normalizeAccuracyM(value: number, fallback = 8): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return fallback;
  return Math.min(50, Math.max(1, rounded));
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isGeolocationError(err: unknown): err is { code: number; message?: unknown } {
  if (!err || typeof err !== "object") return false;
  if (!("code" in err) || typeof (err as { code: unknown }).code !== "number") return false;
  return true;
}

function describeGeolocationError(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  if (!("code" in err) || typeof (err as { code: unknown }).code !== "number") return null;
  const geoError = err as { code: number; message?: unknown };
  const suffix = typeof geoError.message === "string" && geoError.message.trim() ? ` (${geoError.message.trim()})` : "";
  if (geoError.code === 1) return `Location permission denied${suffix}. Allow location access to get directions.`;
  if (geoError.code === 2) return `Location unavailable${suffix}. We could not get a GPS fix.`;
  if (geoError.code === 3) return `Location timed out${suffix}. GPS did not respond in time.`;
  return `Location error${suffix}.`;
}

export function MapRoute() {
  const [nodes, setNodes] = useState<NodePublic[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const [imageExpanded, setImageExpanded] = useState(false);
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
  const location = useLocation();
  const isCreatorSurface = location.pathname.startsWith("/creator");
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const { isLoaded, loadError } = useJsApiLoader({
    id: "groundedart-google-maps",
    googleMapsApiKey: googleMapsApiKey ?? "",
    libraries: GOOGLE_MAPS_LIBRARIES
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
  const demoMode = useMemo(() => {
    if (isCreatorSurface) return true;
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(location.search);
    if (params.has("demo")) return true;
    if (readEnvBool(DEMO_MODE_ENV, false)) return true;
    return readStoredBool(DEMO_ENABLED_STORAGE_KEY, false);
  }, [isCreatorSurface, location.search]);
  const [demoRank, setDemoRank] = useState<number | null>(null);
  const prevDemoRankRef = useRef<number | null>(null);
  const [demoAdminToken, setDemoAdminToken] = useState<string>(() => {
    const fromEnv = import.meta.env.VITE_ADMIN_API_TOKEN as string | undefined;
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();
    if (!demoMode) return "";
    return readStoredString(DEMO_ADMIN_TOKEN_STORAGE_KEY, "");
  });
  const [demoAutoVerify, setDemoAutoVerify] = useState<boolean>(() =>
    demoMode ? readStoredBool(DEMO_AUTO_VERIFY_STORAGE_KEY, readEnvBool(DEMO_AUTO_VERIFY_ENV, true)) : false
  );
  const demoDeviceLocked = useMemo(() => {
    if (DEMO_MODE_ENV !== "true") return false;
    return Boolean(DEMO_DEVICE_ID_ENV?.trim());
  }, []);
  const [puppetEnabled, setPuppetEnabled] = useState<boolean>(() =>
    demoMode ? readStoredBool(DEMO_PUPPET_ENABLED_STORAGE_KEY, readEnvBool(DEMO_PUPPET_ENABLED_ENV, true)) : false
  );
  const [puppetLocation, setPuppetLocation] = useState<google.maps.LatLngLiteral | null>(() => {
    if (!demoMode) return null;
    const lat = readStoredNumber(DEMO_PUPPET_LAT_STORAGE_KEY, Number.NaN);
    const lng = readStoredNumber(DEMO_PUPPET_LNG_STORAGE_KEY, Number.NaN);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    const envLat = readEnvNumber(DEMO_PUPPET_LAT_ENV);
    const envLng = readEnvNumber(DEMO_PUPPET_LNG_ENV);
    if (envLat === null || envLng === null) return null;
    return { lat: envLat, lng: envLng };
  });
  const [puppetPulseStep, setPuppetPulseStep] = useState(0);
  const [puppetAccuracyM, setPuppetAccuracyM] = useState<number>(() =>
    demoMode
      ? normalizeAccuracyM(
          readStoredNumber(
            DEMO_PUPPET_ACCURACY_STORAGE_KEY,
            DEMO_PUPPET_ACCURACY_ENV ? Number(DEMO_PUPPET_ACCURACY_ENV) : 8
          )
        )
      : 8
  );
  const [demoClickToMove, setDemoClickToMove] = useState<boolean>(() =>
    demoMode ? readStoredBool(DEMO_CLICK_TO_MOVE_STORAGE_KEY, readEnvBool(DEMO_CLICK_TO_MOVE_ENV, true)) : false
  );

  const meFetchAbortRef = useRef<AbortController | null>(null);
  const meRef = useRef<MeResponse | null>(null);
  const prevMeRef = useRef<MeResponse | null>(null);

  const [rankPulseKey, setRankPulseKey] = useState(0);
  const [rankUpEvent, setRankUpEvent] = useState<RankUpEvent | null>(null);
  const rankUpDismissTimeoutRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const celebrateNodesOnNextRefreshRef = useRef(false);
  const prevNodesRef = useRef<NodePublic[] | null>(null);
  const [mapRipples, setMapRipples] = useState<Array<{ id: string; position: google.maps.LatLngLiteral }>>([]);

  const bootSession = useCallback(async () => {
    setStatus("Starting…");
    setSessionReady(false);
    try {
      await ensureAnonymousSession();
      setStatus("Ready");
      setSessionReady(true);
    } catch (e) {
      setStatus(`Session error: ${String(e)}`);
    }
  }, []);

  useEffect(() => {
    void bootSession();
  }, [bootSession]);

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
    if (!isCreatorSurface) {
      setNotifications([]);
      setNotificationsStatus("idle");
      setNotificationsError(null);
      return;
    }
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
  }, [isCreatorSurface, sessionReady]);

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

  useEffect(() => {
    if (!demoMode) return;
    try {
      window.localStorage.setItem(DEMO_ENABLED_STORAGE_KEY, "true");
      window.localStorage.setItem(DEMO_AUTO_VERIFY_STORAGE_KEY, String(Boolean(demoAutoVerify)));
      window.localStorage.setItem(DEMO_PUPPET_ENABLED_STORAGE_KEY, String(Boolean(puppetEnabled)));
      window.localStorage.setItem(DEMO_PUPPET_ACCURACY_STORAGE_KEY, String(normalizeAccuracyM(puppetAccuracyM)));
      window.localStorage.setItem(DEMO_CLICK_TO_MOVE_STORAGE_KEY, String(Boolean(demoClickToMove)));
      if (demoAdminToken.trim() && !(import.meta.env.VITE_ADMIN_API_TOKEN as string | undefined)) {
        window.localStorage.setItem(DEMO_ADMIN_TOKEN_STORAGE_KEY, demoAdminToken.trim());
      }
      if (puppetLocation) {
        window.localStorage.setItem(DEMO_PUPPET_LAT_STORAGE_KEY, String(puppetLocation.lat));
        window.localStorage.setItem(DEMO_PUPPET_LNG_STORAGE_KEY, String(puppetLocation.lng));
      }
    } catch {
      // Ignore storage failures.
    }
  }, [demoAdminToken, demoAutoVerify, demoClickToMove, demoMode, puppetAccuracyM, puppetEnabled, puppetLocation]);

  useEffect(() => {
    if (!demoMode) return;
    if (puppetLocation) return;
    const envLat = readEnvNumber(DEMO_PUPPET_LAT_ENV);
    const envLng = readEnvNumber(DEMO_PUPPET_LNG_ENV);
    if (envLat === null || envLng === null) return;
    setPuppetLocation({ lat: envLat, lng: envLng });
  }, [demoMode, puppetLocation]);

  useEffect(() => {
    if (!demoMode || !puppetEnabled) return;
    const intervalId = window.setInterval(() => {
      setPuppetPulseStep((prev) => (prev + 1) % 60);
    }, 90);
    return () => window.clearInterval(intervalId);
  }, [demoMode, puppetEnabled]);

  const defaultUserMarkerIcon = useMemo(() => {
    if (typeof google === "undefined" || !google.maps) return null;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 6,
      fillColor: "#4285f4",
      fillOpacity: 0.9,
      strokeWeight: 2,
      strokeColor: "#ffffff"
    };
  }, []);

  const puppetMarkerIcon = useMemo(() => {
    if (!demoMode || !puppetEnabled) return defaultUserMarkerIcon;
    if (typeof google === "undefined" || !google.maps) return defaultUserMarkerIcon;
    const phase = (puppetPulseStep / 60) * Math.PI * 2;
    const pulse = (Math.sin(phase) + 1) / 2;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 6 + pulse * 1.8,
      fillColor: "#3b82f6",
      fillOpacity: 0.55 + pulse * 0.3,
      strokeWeight: 2,
      strokeColor: "#ffffff",
      strokeOpacity: 0.85 - pulse * 0.2
    };
  }, [defaultUserMarkerIcon, demoMode, puppetEnabled, puppetPulseStep]);

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
    setImageExpanded(false);
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

  const requestCurrentPosition = useCallback(
    (options: PositionOptions) =>
      new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, options)
      ),
    []
  );

  const getLocationFix = useCallback(async (): Promise<{ lat: number; lng: number; accuracy_m: number }> => {
    if (demoMode && puppetEnabled) {
      const fallback = mapRef.current?.getCenter()?.toJSON() ?? DEFAULT_CENTER;
      const loc = puppetLocation ?? fallback;
      const accuracy_m = normalizeAccuracyM(puppetAccuracyM);
      return { lat: loc.lat, lng: loc.lng, accuracy_m };
    }
    if (typeof window !== "undefined") {
      const protocol = window.location?.protocol;
      const hostname = window.location?.hostname;
      if (protocol && protocol !== "https:" && hostname && !isLocalhostHostname(hostname)) {
        throw new Error("Geolocation requires a secure context (HTTPS).");
      }
    }
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== "function") {
      throw new Error("Geolocation is not available in this browser.");
    }
    try {
      const pos = await requestCurrentPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: pos.coords.accuracy };
    } catch (err) {
      if (isGeolocationError(err) && (err.code === 2 || err.code === 3)) {
        const pos = await requestCurrentPosition({ enableHighAccuracy: false, timeout: 20_000, maximumAge: 300_000 });
        return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy_m: pos.coords.accuracy };
      }
      throw err;
    }
  }, [demoMode, puppetAccuracyM, puppetEnabled, puppetLocation, requestCurrentPosition]);

  const setPuppetLocationFromLatLng = useCallback(
    (next: google.maps.LatLngLiteral) => {
      setPuppetLocation(next);
      setUserLocation(next);
    },
    [setPuppetLocation]
  );

  useEffect(() => {
    if (!demoMode || !puppetEnabled) return;
    if (userLocation) return;
    const loc = puppetLocation ?? DEFAULT_CENTER;
    setPuppetLocationFromLatLng(loc);
  }, [demoMode, puppetEnabled, puppetLocation, setPuppetLocationFromLatLng, userLocation]);

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

    if (!sessionReady) {
      setCheckinState("failure");
      setCheckinFailure({
        title: "Session not ready",
        detail: "We’re still establishing a session with the API.",
        nextStep: "Wait a moment and retry check-in."
      });
      return;
    }

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
      const fix = await getLocationFix();
      const origin = { lat: fix.lat, lng: fix.lng };
      if (demoMode && puppetEnabled) setPuppetLocationFromLatLng(origin);
      else setUserLocation(origin);
      setCheckinAccuracyM(fix.accuracy_m);

      setCheckinState("challenging");
      const challenge = await createCheckinChallenge(selectedNode.id);

      setCheckinState("verifying");
      const res = await checkIn(selectedNode.id, {
        challenge_id: challenge.challenge_id,
        lat: fix.lat,
        lng: fix.lng,
        accuracy_m: fix.accuracy_m
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
    const search = demoMode ? "?demo=1" : "";
    navigate(`/capture${search}`, {
      state: { node: selectedNode, checkinToken }
    });
  }

  function handleOpenDetails() {
    if (!selectedNode) return;
    const search = demoMode ? "?demo=1" : "";
    navigate(`/nodes/${selectedNode.id}${search}`, { state: { node: selectedNode } });
  }

  async function handleRequestDirections(nodeOverride?: NodePublic) {
    const node = nodeOverride ?? selectedNode;
    if (!node) return;
    if (!isLoaded || !googleMapsApiKey) {
      setStatus("Map not ready for directions (missing API key or still loading).");
      return;
    }

    setStatus("Requesting location for directions…");
    try {
      const fix = await getLocationFix();
      const origin = { lat: fix.lat, lng: fix.lng };
      if (demoMode && puppetEnabled) setPuppetLocationFromLatLng(origin);
      else setUserLocation(origin);
      const destination = {
        lat: typeof node.lat === "number" ? node.lat : Number(node.lat),
        lng: typeof node.lng === "number" ? node.lng : Number(node.lng)
      };

      if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
        setStatus("Directions error: origin location is invalid (missing or non-numeric coordinates).");
        return;
      }
      if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
        setStatus("Directions error: destination location is invalid (missing or non-numeric coordinates).");
        return;
      }
      setDirectionsResult(null);
      setDirectionsRequest({
        origin,
        destination,
        travelMode: google.maps.TravelMode.WALKING
      });
      setStatus("Requesting directions…");
    } catch (err) {
      const geoMessage = describeGeolocationError(err);
      if (geoMessage) {
        setStatus(`Directions error: ${geoMessage}`);
        return;
      }
      setStatus(`Directions error: ${err instanceof Error ? err.message : String(err)}`);
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

  const handleRefreshNotifications = useCallback(async () => {
    if (!isCreatorSurface) return;
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
  }, [isCreatorSurface]);

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
  const unreadCount = isCreatorSurface ? notifications.filter((notification) => !notification.read_at).length : 0;
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const directionsLeg = useMemo(() => directionsResult?.routes?.[0]?.legs?.[0] ?? null, [directionsResult]);
  const directionsOrigin = useMemo(() => {
    if (demoMode && puppetEnabled) {
      return puppetLocation ?? userLocation;
    }
    return userLocation;
  }, [demoMode, puppetEnabled, puppetLocation, userLocation]);

  const directionsUrl = useMemo(() => {
    if (!selectedNode) return null;
    const destination = `${selectedNode.lat},${selectedNode.lng}`;
    const base = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=walking`;
    if (!directionsOrigin) return base;
    const origin = `${directionsOrigin.lat},${directionsOrigin.lng}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=walking`;
  }, [directionsOrigin, selectedNode]);

  useEffect(() => {
    if (!demoMode) return;
    const handleUploaded = (event: Event) => {
      const detail = (event as CustomEvent<CaptureUploadedEventDetail>).detail;
      if (!detail?.captureId) return;
      pushToast("Upload complete", [`Capture ${detail.captureId.slice(0, 8)}…`]);
      if (!demoAutoVerify) return;
      const token = demoAdminToken.trim();
      if (!token) pushToast("Auto-verify skipped", ["Missing admin token (set in demo controls)."]);
    };

    const handleVerified = (event: Event) => {
      const detail = (event as CustomEvent<CaptureVerifiedEventDetail>).detail;
      if (!detail?.captureId) return;
      pushToast("Capture verified", [`Capture ${detail.captureId.slice(0, 8)}…`]);
      refreshMe(true);
      if (isCreatorSurface) {
        void handleRefreshNotifications();
      }
    };

    window.addEventListener(CAPTURE_UPLOADED_EVENT, handleUploaded as EventListener);
    window.addEventListener(CAPTURE_VERIFIED_EVENT, handleVerified as EventListener);
    return () => {
      window.removeEventListener(CAPTURE_UPLOADED_EVENT, handleUploaded as EventListener);
      window.removeEventListener(CAPTURE_VERIFIED_EVENT, handleVerified as EventListener);
    };
  }, [demoAdminToken, demoAutoVerify, demoMode, handleRefreshNotifications, isCreatorSurface, pushToast, refreshMe]);

  const handleNewDemoUser = useCallback(async () => {
    if (!demoMode) return;
    setStatus("Creating a new demo user…");
    setSelectedNodeId(null);
    setDirectionsRequest(null);
    setDirectionsResult(null);
    setCheckinToken(null);
    setCheckinState("idle");
    setCheckinFailure(null);
    setCheckinAccuracyM(undefined);
    setCheckinDistanceM(undefined);
    setCheckinRadiusM(undefined);
    setDemoRank(null);
    setNotifications([]);
    setNotificationsStatus("idle");
    setNotificationsError(null);

    try {
      await Promise.all(uploadQueue.items.map((item) => uploadQueue.remove(item.captureId)));
    } catch {
      // ignore
    }
    void clearActiveCaptureDraft().catch(() => undefined);
    resetDeviceId();
    await bootSession();
    refreshMe(true);
    if (isCreatorSurface) {
      void handleRefreshNotifications();
    }
    scheduleNodesRefresh(lastBboxRef.current);
    pushToast("New demo user", ["Fresh device session created."]);
  }, [
    bootSession,
    demoMode,
    handleRefreshNotifications,
    isCreatorSurface,
    pushToast,
    refreshMe,
    scheduleNodesRefresh,
    uploadQueue.items,
    uploadQueue.remove
  ]);

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
                <div>
                  <h1 className="text-base md:text-lg font-bold m-0 text-grounded-charcoal dark:text-grounded-parchment">Grounded Art</h1>
                  <div className="text-xs text-grounded-charcoal/60 dark:text-grounded-parchment/60 uppercase tracking-wide mt-1">{status}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="light"
                    size="sm"
                    onClick={handleOpenSettings}
                    className="!p-2 !min-w-0 relative"
                    title="Account & Settings"
                    aria-label="Open account and settings"
                  >
                    <span className="text-base">🔔</span>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-grounded-copper text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>
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
              </div>
            </Card>

            {settingsOpen ? (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                  onClick={handleCloseSettings}
                  role="presentation"
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white dark:bg-grounded-charcoal rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto"
                    role="dialog"
                    aria-modal="true"
                  >
                    <Card variant="light" padding="lg">
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h2 className="text-xl font-bold uppercase tracking-tight text-grounded-charcoal dark:text-grounded-parchment mb-1">
                            Account & Settings
                          </h2>
                          <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                            {isCreatorSurface ? "Creator surface" : "Explorer surface"}
                          </div>
                        </div>
                        <Button variant="light" size="sm" onClick={handleCloseSettings}>
                          Close
                        </Button>
                      </div>

                      <div className="space-y-6">
                        {/* Navigation */}
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-3">
                            Navigation
                          </h3>
                          <div className="flex gap-3">
                            <Button
                              variant={!isCreatorSurface ? "copper" : "light"}
                              size="sm"
                              onClick={() => {
                                navigate("/map");
                                setSettingsOpen(false);
                              }}
                              disabled={!isCreatorSurface}
                            >
                              Explorer map
                            </Button>
                            <Button
                              variant={isCreatorSurface ? "copper" : "light"}
                              size="sm"
                              onClick={() => {
                                navigate("/creator");
                                setSettingsOpen(false);
                              }}
                              disabled={isCreatorSurface}
                            >
                              Creator tools
                            </Button>
                          </div>
                        </div>

                        {/* Profile */}
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-3">
                            Profile
                          </h3>
                          {viewMe ? (
                            <Card variant="light" padding="md">
                              <div className="flex items-center justify-between mb-3">
                                <RankBadge rank={viewMe.rank} pulseKey={rankPulseKey} />
                                <Button variant="light" size="sm" onClick={() => refreshMe(true)} disabled={meStatus === "loading"}>
                                  Refresh rank
                                </Button>
                              </div>
                              {demoRank !== null ? (
                                <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 mb-2">
                                  Demo override: displaying rank {demoRank}.
                                </div>
                              ) : null}
                              {viewMe.next_unlock ? (
                                <div className="space-y-1">
                                  <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">
                                    Next unlock at rank {viewMe.next_unlock.min_rank}.
                                  </div>
                                  {nextUnlockLine ? (
                                    <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">{nextUnlockLine}</div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">Top tier unlocked.</div>
                              )}
                              {capsNotes.map((note) => (
                                <div key={note} className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 mt-1">
                                  {note}
                                </div>
                              ))}
                            </Card>
                          ) : meStatus === "loading" ? (
                            <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">Loading rank…</div>
                          ) : meStatus === "error" ? (
                            <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">Rank unavailable.</div>
                          ) : null}
                        </div>

                        {/* Notifications */}
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-3">
                            Notifications
                          </h3>
                          <Card variant="light" padding="md">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <div className="text-xs text-grounded-charcoal/60 dark:text-grounded-parchment/60 uppercase tracking-wide mb-1">Inbox</div>
                                <div className="text-sm font-medium text-grounded-charcoal dark:text-grounded-parchment">
                                  {notificationsStatus === "loading"
                                    ? "Loading…"
                                    : notificationsStatus === "error"
                                      ? "Unavailable"
                                      : unreadCount
                                        ? `${unreadCount} unread`
                                        : "All caught up"}
                                </div>
                              </div>
                              <Button
                                variant="light"
                                size="sm"
                                onClick={handleRefreshNotifications}
                                disabled={notificationsStatus === "loading"}
                              >
                                {notificationsStatus === "error" ? "Retry" : "Refresh"}
                              </Button>
                            </div>
                            {notificationsStatus === "error" ? (
                              <Alert variant="error" className="mt-3">
                                <p className="text-sm">Could not load notifications.</p>
                                <p className="text-xs mt-1">{notificationsError ?? "Unknown error"}</p>
                              </Alert>
                            ) : null}
                            {notificationsStatus !== "loading" && notifications.length === 0 ? (
                              <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">No notifications yet.</div>
                            ) : null}
                            {notifications.length > 0 ? (
                              <div className="mt-4 space-y-3">
                                {notifications.map((notification) => {
                                  const missing = formatMissingFields(notification.details?.missing_fields);
                                  return (
                                    <Card key={notification.id} variant="light" padding="sm">
                                      <div className="flex justify-between items-start gap-4 mb-2">
                                        <div>
                                          <div className="text-sm font-semibold text-grounded-charcoal dark:text-grounded-parchment">
                                            {notification.title}
                                          </div>
                                          <div className="text-xs text-grounded-charcoal/60 dark:text-grounded-parchment/60 mt-1">
                                            {formatNotificationTimestamp(notification.created_at)}
                                          </div>
                                        </div>
                                        <Button
                                          variant="light"
                                          size="sm"
                                          onClick={() => void handleMarkNotificationRead(notification.id)}
                                          disabled={Boolean(notification.read_at)}
                                        >
                                          {notification.read_at ? "Read" : "Mark read"}
                                        </Button>
                                      </div>
                                      {notification.body ? (
                                        <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 mt-2">
                                          {notification.body}
                                        </div>
                                      ) : null}
                                      {missing ? (
                                        <div className="text-xs text-grounded-charcoal/60 dark:text-grounded-parchment/60 mt-2">
                                          Missing: {missing}
                                        </div>
                                      ) : null}
                                    </Card>
                                  );
                                })}
                              </div>
                            ) : null}
                          </Card>
                        </div>

                        {/* Map Settings */}
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-3">
                            Map Settings
                          </h3>
                          <Card variant="light" padding="md">
                            <div className="space-y-4">
                              <div>
                                <div className="text-xs uppercase tracking-wide text-grounded-charcoal/70 dark:text-grounded-parchment/70 mb-2">
                                  Map style preset
                                </div>
                                <div className="space-y-2">
                                  {MAP_STYLE_ORDER.map((presetKey) => (
                                    <label key={presetKey} className="flex items-center gap-2 cursor-pointer group">
                                      <input
                                        type="radio"
                                        name="map-style-preset"
                                        value={presetKey}
                                        checked={mapStylePreset === presetKey}
                                        onChange={handleMapStyleChange}
                                        className="w-4 h-4 text-grounded-copper focus:ring-grounded-copper"
                                      />
                                      <span className="text-sm text-grounded-charcoal dark:text-grounded-parchment group-hover:text-grounded-copper transition-colors">
                                        {MAP_STYLE_PRESETS[presetKey].label}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                                <div className="text-xs text-grounded-charcoal/60 dark:text-grounded-parchment/60 mt-2">
                                  {MAP_STYLE_PRESETS[mapStylePreset].description}
                                </div>
                              </div>
                            </div>
                          </Card>
                        </div>

                        {/* Demo Controls */}
                        {demoMode ? (
                          <div>
                            <h3 className="text-sm font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-3">
                              Creator Tools
                            </h3>
                            <Card variant="light" padding="md" className="border-2 border-grounded-copper/20">
                              <details className="group" open>
                                <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-4 pb-3 border-b border-grounded-charcoal/10 dark:border-grounded-parchment/10">
                                  <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span>Demo Controls</span>
                                  </div>
                                  <svg
                                    className="w-4 h-4 transition-transform duration-300 group-open:rotate-180 text-grounded-charcoal/60 dark:text-grounded-parchment/60"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </summary>
                                <div className="space-y-5 mt-4">
                                  {/* Rank Simulation */}
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                      <svg className="w-4 h-4 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                      </svg>
                                      <h4 className="text-xs font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment">
                                        Rank Simulation
                                      </h4>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <Button
                                        variant="light"
                                        size="sm"
                                        onClick={() => setDemoRank((prev) => (prev ?? viewMe?.rank ?? 0) + 1)}
                                        disabled={!viewMe}
                                        className="text-xs"
                                      >
                                        <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                        </svg>
                                        Rank +1
                                      </Button>
                                      <Button
                                        variant="light"
                                        size="sm"
                                        onClick={() => setDemoRank(viewMe?.next_unlock?.min_rank ?? null)}
                                        disabled={!viewMe?.next_unlock}
                                        className="text-xs"
                                      >
                                        <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                        </svg>
                                        Next Unlock
                                      </Button>
                                      <Button
                                        variant="light"
                                        size="sm"
                                        onClick={() => {
                                          const sample = nodes.slice(0, 3);
                                          addMapRipples(sample);
                                          pushToast("New nodes available", sample.map((n) => n.name));
                                        }}
                                        disabled={!nodes.length}
                                        className="text-xs col-span-2"
                                      >
                                        <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                                        </svg>
                                        Simulate Node Splash
                                      </Button>
                                      {demoRank !== null && (
                                        <Button
                                          variant="copper"
                                          size="sm"
                                          onClick={() => setDemoRank(null)}
                                          className="text-xs col-span-2"
                                        >
                                          <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                          Clear Demo Override
                                        </Button>
                                      )}
                                    </div>
                                    {demoRank !== null && (
                                      <div className="px-3 py-2 rounded-lg bg-grounded-copper/10 dark:bg-grounded-copper/20 border border-grounded-copper/30">
                                        <div className="text-xs font-medium text-grounded-charcoal dark:text-grounded-parchment">
                                          Demo rank override: <span className="font-bold text-grounded-copper">{demoRank}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="border-t border-grounded-charcoal/10 dark:border-grounded-parchment/10 pt-4">
                                    {/* Puppet Location */}
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        <h4 className="text-xs font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment">
                                          Location Puppet
                                        </h4>
                                      </div>
                                      <div className="space-y-3">
                                        <div className="space-y-2">
                                          <label className="flex items-center gap-2.5 cursor-pointer group p-2 rounded-lg hover:bg-grounded-charcoal/5 dark:hover:bg-grounded-parchment/5 transition-colors">
                                            <input
                                              type="checkbox"
                                              checked={puppetEnabled}
                                              onChange={(event) => setPuppetEnabled(event.target.checked)}
                                              className="w-4 h-4 rounded border-grounded-charcoal/30 dark:border-grounded-parchment/30 text-grounded-copper focus:ring-2 focus:ring-grounded-copper/50 transition-colors"
                                            />
                                            <span className="text-sm text-grounded-charcoal dark:text-grounded-parchment flex-1">
                                              Use puppet location
                                            </span>
                                            {puppetEnabled && (
                                              <span className="w-2 h-2 rounded-full bg-grounded-copper animate-pulse"></span>
                                            )}
                                          </label>
                                          <label className="flex items-center gap-2.5 cursor-pointer group p-2 rounded-lg hover:bg-grounded-charcoal/5 dark:hover:bg-grounded-parchment/5 transition-colors">
                                            <input
                                              type="checkbox"
                                              checked={demoClickToMove}
                                              onChange={(event) => setDemoClickToMove(event.target.checked)}
                                              className="w-4 h-4 rounded border-grounded-charcoal/30 dark:border-grounded-parchment/30 text-grounded-copper focus:ring-2 focus:ring-grounded-copper/50 transition-colors"
                                            />
                                            <span className="text-sm text-grounded-charcoal dark:text-grounded-parchment flex-1">
                                              Click map to move
                                            </span>
                                          </label>
                                        </div>
                                        {/* Location Display Card */}
                                        {puppetLocation ? (
                                          <div className="relative rounded-xl bg-gradient-to-br from-grounded-copper/10 via-grounded-copper/5 to-transparent dark:from-grounded-copper/20 dark:via-grounded-copper/10 border-2 border-grounded-copper/20 dark:border-grounded-copper/30 p-4 shadow-sm w-full min-w-0 overflow-hidden">
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                              <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-grounded-copper/20 dark:bg-grounded-copper/30 flex items-center justify-center">
                                                  <svg className="w-4 h-4 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                  </svg>
                                                </div>
                                                <div>
                                                  <div className="text-xs font-semibold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment">
                                                    Current Location
                                                  </div>
                                                  <div className="text-[10px] text-grounded-charcoal/60 dark:text-grounded-parchment/60 mt-0.5">
                                                    Puppet position
                                                  </div>
                                                </div>
                                              </div>
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  const coords = `${puppetLocation.lat.toFixed(5)}, ${puppetLocation.lng.toFixed(5)}`;
                                                  try {
                                                    await navigator.clipboard.writeText(coords);
                                                    pushToast("Copied!", ["Coordinates copied to clipboard"]);
                                                  } catch (err) {
                                                    // Fallback for older browsers
                                                    const textarea = document.createElement("textarea");
                                                    textarea.value = coords;
                                                    document.body.appendChild(textarea);
                                                    textarea.select();
                                                    document.execCommand("copy");
                                                    document.body.removeChild(textarea);
                                                    pushToast("Copied!", ["Coordinates copied to clipboard"]);
                                                  }
                                                }}
                                                className="p-1.5 rounded-lg hover:bg-grounded-charcoal/10 dark:hover:bg-grounded-parchment/10 transition-colors group"
                                                title="Copy coordinates"
                                              >
                                                <svg className="w-3.5 h-3.5 text-grounded-charcoal/60 dark:text-grounded-parchment/60 group-hover:text-grounded-copper transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                              </button>
                                            </div>
                                            <div className="space-y-2.5">
                                              <div className="p-2.5 rounded-lg bg-white/60 dark:bg-grounded-charcoal/40 backdrop-blur-sm border border-grounded-charcoal/10 dark:border-grounded-parchment/10">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                  <svg className="w-3.5 h-3.5 text-grounded-copper flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                                  </svg>
                                                  <span className="text-xs font-medium text-grounded-charcoal/70 dark:text-grounded-parchment/70">Coordinates</span>
                                                </div>
                                                <div className="font-mono text-xs font-semibold text-grounded-charcoal dark:text-grounded-parchment break-words leading-relaxed min-w-0">
                                                  <div className="break-all" title={`${puppetLocation.lat.toFixed(5)}, ${puppetLocation.lng.toFixed(5)}`}>
                                                    {puppetLocation.lat.toFixed(5)}, {puppetLocation.lng.toFixed(5)}
                                                  </div>
                                                </div>
                                              </div>
                                              <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/60 dark:bg-grounded-charcoal/40 backdrop-blur-sm border border-grounded-charcoal/10 dark:border-grounded-parchment/10 gap-2">
                                                <div className="flex items-center gap-2 min-w-0 flex-shrink">
                                                  <svg className="w-3.5 h-3.5 text-grounded-copper flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                  </svg>
                                                  <span className="text-xs font-medium text-grounded-charcoal/70 dark:text-grounded-parchment/70">Accuracy</span>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                                  <div className="h-2 w-2 rounded-full bg-grounded-copper animate-pulse"></div>
                                                  <span className="font-semibold text-sm text-grounded-charcoal dark:text-grounded-parchment whitespace-nowrap">
                                                    {normalizeAccuracyM(puppetAccuracyM)}m
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="px-4 py-6 rounded-xl border-2 border-dashed border-grounded-charcoal/20 dark:border-grounded-parchment/20 bg-grounded-charcoal/5 dark:bg-grounded-parchment/5 text-center">
                                            <svg className="w-8 h-8 mx-auto mb-2 text-grounded-charcoal/40 dark:text-grounded-parchment/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <div className="text-xs font-medium text-grounded-charcoal/60 dark:text-grounded-parchment/60">
                                              No location set
                                            </div>
                                            <div className="text-[10px] text-grounded-charcoal/50 dark:text-grounded-parchment/50 mt-1">
                                              Use buttons below to set location
                                            </div>
                                          </div>
                                        )}
                                        
                                        {/* Quick Actions */}
                                        <div className="grid grid-cols-2 gap-2">
                                          <Button
                                            variant="light"
                                            size="sm"
                                            onClick={() => {
                                              const center = mapRef.current?.getCenter()?.toJSON() ?? DEFAULT_CENTER;
                                              setPuppetLocationFromLatLng(center);
                                            }}
                                            disabled={!isLoaded}
                                            className="text-xs"
                                          >
                                            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Map Center
                                          </Button>
                                          <Button
                                            variant="light"
                                            size="sm"
                                            onClick={() => {
                                              if (!selectedNode) return;
                                              setPuppetLocationFromLatLng({ lat: selectedNode.lat, lng: selectedNode.lng });
                                            }}
                                            disabled={!selectedNode}
                                            className="text-xs"
                                          >
                                            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            Selected Node
                                          </Button>
                                        </div>

                                        {/* Accuracy Control */}
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between">
                                            <label className="text-xs font-semibold text-grounded-charcoal/80 dark:text-grounded-parchment/80">
                                              Accuracy Radius
                                            </label>
                                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-grounded-charcoal/5 dark:bg-grounded-parchment/5">
                                              <span className="text-xs font-mono font-semibold text-grounded-charcoal dark:text-grounded-parchment">
                                                {normalizeAccuracyM(puppetAccuracyM)}m
                                              </span>
                                            </div>
                                          </div>
                                          <div className="relative">
                                            <input
                                              type="range"
                                              min={1}
                                              max={50}
                                              step={1}
                                              value={normalizeAccuracyM(puppetAccuracyM)}
                                              onChange={(event) => setPuppetAccuracyM(normalizeAccuracyM(Number(event.target.value)))}
                                              className="w-full h-2 bg-grounded-charcoal/10 dark:bg-grounded-parchment/10 rounded-lg appearance-none cursor-pointer accent-grounded-copper"
                                              style={{
                                                background: `linear-gradient(to right, #D97706 0%, #D97706 ${(normalizeAccuracyM(puppetAccuracyM) / 50) * 100}%, rgba(26, 23, 21, 0.1) ${(normalizeAccuracyM(puppetAccuracyM) / 50) * 100}%, rgba(26, 23, 21, 0.1) 100%)`
                                              }}
                                            />
                                            <div className="flex items-center justify-between mt-1.5 text-[10px] text-grounded-charcoal/50 dark:text-grounded-parchment/50">
                                              <span>1m</span>
                                              <span>25m</span>
                                              <span>50m</span>
                                            </div>
                                          </div>
                                          <div className="flex gap-2">
                                            {[3, 5, 8, 10].map((value) => (
                                              <button
                                                key={value}
                                                type="button"
                                                onClick={() => setPuppetAccuracyM(value)}
                                                className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                                                  normalizeAccuracyM(puppetAccuracyM) === value
                                                    ? "bg-grounded-copper text-white shadow-sm"
                                                    : "bg-grounded-charcoal/5 dark:bg-grounded-parchment/5 text-grounded-charcoal/70 dark:text-grounded-parchment/70 hover:bg-grounded-charcoal/10 dark:hover:bg-grounded-parchment/10"
                                                }`}
                                              >
                                                {value}m
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="border-t border-grounded-charcoal/10 dark:border-grounded-parchment/10 pt-4">
                                    {/* Auto-Verify */}
                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <div className="w-7 h-7 rounded-lg bg-grounded-copper/10 dark:bg-grounded-copper/20 flex items-center justify-center">
                                            <svg className="w-4 h-4 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                          </div>
                                          <h4 className="text-xs font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment">
                                            Auto-Verify
                                          </h4>
                                        </div>
                                        {demoAutoVerify && (
                                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-grounded-copper/10 dark:bg-grounded-copper/20 border border-grounded-copper/30">
                                            <div className="w-1.5 h-1.5 rounded-full bg-grounded-copper animate-pulse"></div>
                                            <span className="text-[10px] font-semibold text-grounded-copper uppercase tracking-wide">Active</span>
                                          </div>
                                        )}
                                      </div>
                                      
                                      <div className={`p-3 rounded-lg border-2 transition-all ${
                                        demoAutoVerify 
                                          ? "bg-grounded-copper/5 dark:bg-grounded-copper/10 border-grounded-copper/30 dark:border-grounded-copper/40" 
                                          : "bg-grounded-charcoal/5 dark:bg-grounded-parchment/5 border-grounded-charcoal/10 dark:border-grounded-parchment/10"
                                      }`}>
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                          <div className="relative">
                                            <input
                                              type="checkbox"
                                              checked={demoAutoVerify}
                                              onChange={(event) => setDemoAutoVerify(event.target.checked)}
                                              className="w-5 h-5 rounded border-2 border-grounded-charcoal/30 dark:border-grounded-parchment/30 text-grounded-copper focus:ring-2 focus:ring-grounded-copper/50 transition-all cursor-pointer"
                                            />
                                            {demoAutoVerify && (
                                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                <svg className="w-3 h-3 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex-1">
                                            <div className="text-sm font-medium text-grounded-charcoal dark:text-grounded-parchment">
                                              Automatically verify captures
                                            </div>
                                            <div className="text-xs text-grounded-charcoal/60 dark:text-grounded-parchment/60 mt-0.5">
                                              After upload, verify capture as admin
                                            </div>
                                          </div>
                                        </label>
                                      </div>

                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <label className="text-xs font-semibold text-grounded-charcoal/80 dark:text-grounded-parchment/80">
                                            Admin API Token
                                          </label>
                                          {demoAdminToken ? (
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-grounded-copper/10 dark:bg-grounded-copper/20">
                                              <svg className="w-3 h-3 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                              </svg>
                                              <span className="text-[10px] font-medium text-grounded-copper">Set</span>
                                            </div>
                                          ) : (
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-grounded-charcoal/10 dark:bg-grounded-parchment/10">
                                              <span className="text-[10px] font-medium text-grounded-charcoal/60 dark:text-grounded-parchment/60">Required</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="relative">
                                          <input
                                            type="password"
                                            value={demoAdminToken}
                                            onChange={(event) => setDemoAdminToken(event.target.value)}
                                            placeholder="Paste ADMIN_API_TOKEN here"
                                            className={`w-full px-3 py-2.5 pr-10 rounded-lg border-2 text-sm focus:outline-none focus:ring-2 transition-all font-mono ${
                                              demoAdminToken
                                                ? "border-grounded-copper/40 dark:border-grounded-copper/50 bg-grounded-copper/5 dark:bg-grounded-copper/10 focus:ring-grounded-copper/50 focus:border-grounded-copper"
                                                : "border-grounded-charcoal/20 dark:border-grounded-parchment/20 bg-white dark:bg-grounded-charcoal/50 focus:ring-grounded-copper/50 focus:border-grounded-copper/50"
                                            }`}
                                          />
                                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {demoAdminToken ? (
                                              <svg className="w-4 h-4 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                              </svg>
                                            ) : (
                                              <svg className="w-4 h-4 text-grounded-charcoal/40 dark:text-grounded-parchment/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                              </svg>
                                            )}
                                          </div>
                                        </div>
                                        <div className="px-3 py-2 rounded-lg bg-grounded-charcoal/5 dark:bg-grounded-parchment/5 border border-grounded-charcoal/10 dark:border-grounded-parchment/10">
                                          <p className="text-xs text-grounded-charcoal/70 dark:text-grounded-parchment/70 leading-relaxed">
                                            <span className="font-medium">Tip:</span> You can also set this via the{" "}
                                            <code className="px-1.5 py-0.5 rounded bg-grounded-charcoal/10 dark:bg-grounded-parchment/10 font-mono text-[10px]">
                                              VITE_ADMIN_API_TOKEN
                                            </code>{" "}
                                            environment variable.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="border-t border-grounded-charcoal/10 dark:border-grounded-parchment/10 pt-4">
                                    {/* Session */}
                                    <div className="space-y-4">
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-grounded-copper/10 dark:bg-grounded-copper/20 flex items-center justify-center">
                                          <svg className="w-4 h-4 text-grounded-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                          </svg>
                                        </div>
                                        <h4 className="text-xs font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment">
                                          Session
                                        </h4>
                                      </div>
                                      
                                      <div className="space-y-3">
                                        <Button
                                          variant={demoDeviceLocked ? "light" : "copper"}
                                          size="sm"
                                          onClick={() => void handleNewDemoUser()}
                                          disabled={demoDeviceLocked}
                                          className="w-full text-xs font-semibold py-2.5"
                                        >
                                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                          </svg>
                                          Create New Demo User
                                        </Button>
                                        
                                        {demoDeviceLocked ? (
                                          <div className="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800/50">
                                            <div className="flex items-start gap-2.5">
                                              <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                              </svg>
                                              <div className="flex-1 min-w-0">
                                                <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">
                                                  Device Locked
                                                </div>
                                                <div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                                                  Demo device is locked via{" "}
                                                  <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 font-mono text-[10px]">
                                                    VITE_DEMO_DEVICE_ID
                                                  </code>
                                                  . Create new users is disabled.
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="px-3 py-2 rounded-lg bg-grounded-charcoal/5 dark:bg-grounded-parchment/5 border border-grounded-charcoal/10 dark:border-grounded-parchment/10">
                                            <div className="text-xs text-grounded-charcoal/70 dark:text-grounded-parchment/70 leading-relaxed">
                                              Creates a new anonymous session with a fresh device ID. Useful for testing different user states.
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </details>
                            </Card>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            ) : null}

            {uploadQueue.persistenceError ? (
              <Alert variant="warning" title="Upload persistence unavailable" className="mb-3">
                <p className="text-sm">{uploadQueue.persistenceError}</p>
              </Alert>
            ) : null}

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
                        !sessionReady ||
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
                    <Button
                      variant="light"
                      size="sm"
                      onClick={() => void handleRequestDirections()}
                      disabled={!isLoaded}
                    >
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
                            <Button variant="copper" size="sm" onClick={handleCheckIn} disabled={!sessionReady || !isOnline}>
                              Retry check-in
                            </Button>
                            <Button
                              variant="light"
                              size="sm"
                              onClick={() => void handleRequestDirections()}
                              disabled={!isLoaded}
                            >
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
            onClick={(event) => {
              if (!demoMode || !puppetEnabled || !demoClickToMove) return;
              const latLng = event.latLng;
              if (!latLng) return;
              setPuppetLocationFromLatLng({ lat: latLng.lat(), lng: latLng.lng() });
            }}
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
                title={demoMode && puppetEnabled ? "Puppet location" : "Your location"}
                draggable={demoMode && puppetEnabled}
                onDragEnd={(event) => {
                  if (!demoMode || !puppetEnabled) return;
                  const latLng = event.latLng;
                  if (!latLng) return;
                  setPuppetLocationFromLatLng({ lat: latLng.lat(), lng: latLng.lng() });
                }}
                icon={puppetMarkerIcon ?? undefined}
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
