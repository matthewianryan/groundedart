import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DirectionsRenderer,
  DirectionsService,
  GoogleMap,
  Marker,
  OverlayView,
  useJsApiLoader
} from "@react-google-maps/api";
import { useLocation, useNavigate } from "react-router-dom";
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

const NODE_FETCH_DEBOUNCE_MS = 250;
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: -33.9249, lng: 18.4241 };
const MAP_CONTAINER_STYLE = { height: "100%", width: "100%" };
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: "greedy"
};
const MAP_STYLE_STORAGE_KEY = "groundedart.mapStylePreset";
const LIGHT_MAP_STYLE_STORAGE_KEY = "groundedart.mapStylePreset.light";
const THEME_STORAGE_KEY = "groundedart.theme";
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

type MapStylePresetKey = "default" | "ultra-minimal" | "streets" | "context" | "nocturne";
type ThemeMode = "light" | "dark";
type MapStylePreset = {
  label: string;
  description: string;
  styles: google.maps.MapTypeStyle[] | null;
};

const MAP_STYLE_PRESETS: Record<MapStylePresetKey, MapStylePreset> = {
  default: {
    label: "Default",
    description: "",
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
  },
  nocturne: {
    label: "Nocturne",
    description: "Dark, minimal styling tuned for night mode.",
    styles: [
      { elementType: "geometry", stylers: [{ color: "#181512" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#181512" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#a79b8f" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] },
      { featureType: "transit", stylers: [{ visibility: "off" }] },
      { featureType: "administrative", elementType: "labels", stylers: [{ visibility: "off" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2420" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#3b332c" }] },
      { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3f352e" }, { weight: 1.5 }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f0d0b" }] }
    ]
  }
};

const MAP_STYLE_ORDER: MapStylePresetKey[] = ["default", "ultra-minimal", "streets", "context", "nocturne"];
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

function getStoredLightMapStylePreset(): MapStylePresetKey {
  if (typeof window === "undefined") return "default";
  try {
    const stored = window.localStorage.getItem(LIGHT_MAP_STYLE_STORAGE_KEY);
    if (stored && isMapStylePresetKey(stored) && stored !== "nocturne") return stored;
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

function persistLightMapStylePreset(preset: MapStylePresetKey) {
  if (preset === "nocturne") return;
  try {
    window.localStorage.setItem(LIGHT_MAP_STYLE_STORAGE_KEY, preset);
  } catch {
    // Ignore storage failures.
  }
}

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Ignore storage failures.
  }
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function persistTheme(theme: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
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

function normalizeLatLng(
  value: google.maps.LatLngLiteral | null,
  fallback: google.maps.LatLngLiteral
): google.maps.LatLngLiteral {
  if (!value) return fallback;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return fallback;
  return { lat, lng };
}

function getSafeMapCenter(map: google.maps.Map | null): google.maps.LatLngLiteral {
  const center = map?.getCenter?.();
  const next = center?.toJSON?.() ?? null;
  return normalizeLatLng(next, DEFAULT_CENTER);
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
    libraries: []
  });
  const [directionsRequest, setDirectionsRequest] = useState<google.maps.DirectionsRequest | null>(null);
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
  const directionsCacheRef = useRef<Map<string, google.maps.DirectionsResult>>(new Map());
  const pendingDirectionsNodeIdRef = useRef<string | null>(null);
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [mapStylePreset, setMapStylePreset] = useState<MapStylePresetKey>(() => getStoredMapStylePreset());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
  const [lastLightMapPreset, setLastLightMapPreset] = useState<MapStylePresetKey>(() => getStoredLightMapStylePreset());
  const nodeFetchAbortRef = useRef<AbortController | null>(null);
  const nodeFetchDebounceRef = useRef<number | null>(null);
  const lastBboxRef = useRef<string | undefined>(undefined);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const uploadQueue = useUploadQueue();
  const demoMode = useMemo(() => {
    if (isCreatorSurface) return true;
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(location.search);
    if (params.has("demo")) return true;
    if (readEnvBool(DEMO_MODE_ENV, false)) return true;
    return readStoredBool(DEMO_ENABLED_STORAGE_KEY, true);
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
  const directionsUpdateTimeoutRef = useRef<number | null>(null);
  const prevPuppetLocationRef = useRef<google.maps.LatLngLiteral | null>(null);

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
    if (!sessionReady || !mapRef.current) return;
    const bounds = mapRef.current.getBounds();
    scheduleNodesRefresh(bounds ? bboxString(bounds) : lastBboxRef.current);
  }, [scheduleNodesRefresh, sessionReady]);

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
    document.documentElement.dataset.theme = themeMode;
    persistTheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (themeMode === "dark") {
      if (mapStylePreset !== "nocturne") {
        setLastLightMapPreset(mapStylePreset);
        setMapStylePreset("nocturne");
      }
      return;
    }
    if (mapStylePreset === "nocturne") {
      setMapStylePreset(lastLightMapPreset);
    }
  }, [lastLightMapPreset, mapStylePreset, themeMode]);

  useEffect(() => {
    if (themeMode !== "light") return;
    if (mapStylePreset === "nocturne") return;
    if (mapStylePreset === lastLightMapPreset) return;
    setLastLightMapPreset(mapStylePreset);
    persistLightMapStylePreset(mapStylePreset);
  }, [lastLightMapPreset, mapStylePreset, themeMode]);

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
    if (!isLoaded || typeof google === "undefined" || !google.maps) return null;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 12,
      fillColor: "#4285f4",
      fillOpacity: 1,
      strokeWeight: 3,
      strokeColor: "#ffffff",
      strokeOpacity: 0.95
    };
  }, [isLoaded]);

  const puppetMarkerIcon = useMemo(() => {
    if (!demoMode || !puppetEnabled) return defaultUserMarkerIcon;
    if (typeof google === "undefined" || !google.maps) return defaultUserMarkerIcon;
    const phase = (puppetPulseStep / 60) * Math.PI * 2;
    const pulse = (Math.sin(phase) + 1) / 2;
    return {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 12 + pulse * 3.5,
      fillColor: "#3b82f6",
      fillOpacity: 0.75 + pulse * 0.2,
      strokeWeight: 3,
      strokeColor: "#ffffff",
      strokeOpacity: 0.95
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
      if (directionsUpdateTimeoutRef.current !== null) window.clearTimeout(directionsUpdateTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedNodeId) {
      pendingDirectionsNodeIdRef.current = null;
      setDirectionsRequest(null);
      setDirectionsResult(null);
      return;
    }

    const cached = directionsCacheRef.current.get(selectedNodeId) ?? null;
    setDirectionsResult(cached);
    if (pendingDirectionsNodeIdRef.current && pendingDirectionsNodeIdRef.current !== selectedNodeId) {
      pendingDirectionsNodeIdRef.current = null;
      setDirectionsRequest(null);
    }
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
      const fallback = getSafeMapCenter(mapRef.current);
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
      const safe = normalizeLatLng(next, DEFAULT_CENTER);
      setPuppetLocation(safe);
      setUserLocation(safe);
    },
    [setPuppetLocation]
  );

  useEffect(() => {
    if (!demoMode || !puppetEnabled || !selectedNode || !puppetLocation) return;
    if (!isLoaded || !googleMapsApiKey) return;
    if (!directionsResult && !directionsRequest) return;
    const prev = prevPuppetLocationRef.current;
    if (prev && Math.abs(prev.lat - puppetLocation.lat) < 1e-6 && Math.abs(prev.lng - puppetLocation.lng) < 1e-6) {
      return;
    }
    prevPuppetLocationRef.current = puppetLocation;
    if (directionsUpdateTimeoutRef.current !== null) window.clearTimeout(directionsUpdateTimeoutRef.current);
    directionsUpdateTimeoutRef.current = window.setTimeout(() => {
      pendingDirectionsNodeIdRef.current = selectedNode.id;
      setDirectionsRequest({
        origin: puppetLocation,
        destination: { lat: selectedNode.lat, lng: selectedNode.lng },
        travelMode: google.maps.TravelMode.WALKING
      });
    }, 160);
  }, [
    demoMode,
    directionsRequest,
    directionsResult,
    googleMapsApiKey,
    isLoaded,
    puppetEnabled,
    puppetLocation,
    selectedNode
  ]);

  useEffect(() => {
    if (!demoMode || !puppetEnabled) return;
    if (userLocation) return;
    const loc = normalizeLatLng(puppetLocation, DEFAULT_CENTER);
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

    const cached = directionsCacheRef.current.get(node.id);
    if (cached) {
      pendingDirectionsNodeIdRef.current = null;
      setDirectionsRequest(null);
      setDirectionsResult(cached);
      return;
    }

    setStatus("Requesting location for directions…");
    try {
      const fix = await getLocationFix();
      const origin = { lat: fix.lat, lng: fix.lng };
      if (demoMode && puppetEnabled) setPuppetLocationFromLatLng(origin);
      else setUserLocation(origin);
      const destination = { lat: node.lat, lng: node.lng };
      setDirectionsResult(null);
      pendingDirectionsNodeIdRef.current = node.id;
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
      const pendingNodeId = pendingDirectionsNodeIdRef.current;
      if (!res) {
        if (status && status !== "OK") setStatus(`Directions error: ${status}`);
        return;
      }

      if (status === "OK") {
        if (pendingNodeId) directionsCacheRef.current.set(pendingNodeId, res);
        if (pendingNodeId === selectedNodeId) {
          setDirectionsResult(res);
        }
        pendingDirectionsNodeIdRef.current = null;
        setDirectionsRequest(null);
        setStatus("Route ready.");
      } else if (status) {
        pendingDirectionsNodeIdRef.current = null;
        setDirectionsRequest(null);
        setStatus(`Directions error: ${status}`);
      }
    },
    [selectedNodeId]
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
  const statusMessage = useMemo(() => {
    if (!status.startsWith("Directions error")) return null;
    return status;
  }, [status]);
  const directionsOrigin = useMemo(() => {
    if (demoMode && puppetEnabled) {
      return normalizeLatLng(puppetLocation ?? userLocation, DEFAULT_CENTER);
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

  const demoPuppetLocation = useMemo(() => {
    if (!demoMode || !puppetEnabled) return null;
    return normalizeLatLng(puppetLocation ?? userLocation, DEFAULT_CENTER);
  }, [demoMode, puppetEnabled, puppetLocation, userLocation]);

  const activeUserLocation = useMemo(() => {
    if (demoMode && puppetEnabled) return normalizeLatLng(puppetLocation ?? userLocation, DEFAULT_CENTER);
    return userLocation;
  }, [demoMode, puppetEnabled, puppetLocation, userLocation]);

  const demoPuppetLabel = useMemo(() => {
    if (!puppetEnabled) return "disabled";
    if (!demoPuppetLocation) return "unset";
    return `${demoPuppetLocation.lat.toFixed(5)}, ${demoPuppetLocation.lng.toFixed(5)}`;
  }, [demoPuppetLocation, puppetEnabled]);

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
    directionsCacheRef.current.clear();
    pendingDirectionsNodeIdRef.current = null;
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
    <div className="layout">
      <div className="map-area">
        <div className="map-ui">
          <button
            type="button"
            className="icon-button map-card"
            onClick={handleOpenSettings}
            aria-label="Open account and settings"
          >
            <span aria-hidden="true">{isCreatorSurface ? "🔔" : "⚙️"}</span>
            {isCreatorSurface && unreadCount ? <span className="badge">{unreadCount}</span> : null}
          </button>
        </div>
        {demoMode ? (
          <div className="map-demo-toolbar map-card">
            <div className="map-demo-header">
              <span className="map-demo-dot" aria-hidden="true" />
              <div>
                <div className="map-demo-title">Demo user</div>
                <div className="muted">Drag the blue dot to move.</div>
              </div>
            </div>
            <details className="settings">
              <summary>Demo controls</summary>
              <div className="settings-body">
                <div className="settings-group">
                  <div className="settings-label">Rank simulation</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => setDemoRank((prev) => (prev ?? viewMe?.rank ?? 0) + 1)}
                      disabled={!viewMe}
                    >
                      Rank up (+1)
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setDemoRank(viewMe?.next_unlock?.min_rank ?? null)}
                      disabled={!viewMe?.next_unlock}
                    >
                      Jump to next unlock
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        const sample = nodes.slice(0, 3);
                        addMapRipples(sample);
                        pushToast("New nodes available", sample.map((n) => n.name));
                      }}
                      disabled={!nodes.length}
                    >
                      Simulate node splash
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setDemoRank(null)}
                      disabled={demoRank === null}
                    >
                      Clear demo
                    </button>
                  </div>
                </div>
                <div className="settings-group">
                  <div className="settings-label">Puppet location</div>
                  <label className="settings-option" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={puppetEnabled}
                      onChange={(event) => setPuppetEnabled(event.target.checked)}
                    />
                    <span>Use puppet location (no GPS prompts)</span>
                  </label>
                  <label className="settings-option" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={demoClickToMove}
                      onChange={(event) => setDemoClickToMove(event.target.checked)}
                      disabled={!puppetEnabled}
                    />
                    <span>Click map to move puppet</span>
                  </label>
                  <div className="map-demo-meta muted">
                    Location: {demoPuppetLabel} • Accuracy: {normalizeAccuracyM(puppetAccuracyM)}m
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                  const center = getSafeMapCenter(mapRef.current);
                  setPuppetLocationFromLatLng(center);
                      }}
                      disabled={!isLoaded || !puppetEnabled}
                    >
                      Set to map center
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedNode) return;
                        setPuppetLocationFromLatLng({ lat: selectedNode.lat, lng: selectedNode.lng });
                      }}
                      disabled={!selectedNode || !puppetEnabled}
                    >
                      Set to selected node
                    </button>
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <label>
                      <div className="muted">Puppet accuracy (meters)</div>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        value={normalizeAccuracyM(puppetAccuracyM)}
                        onChange={(event) => setPuppetAccuracyM(normalizeAccuracyM(Number(event.target.value)))}
                        disabled={!puppetEnabled}
                      />
                    </label>
                  </div>
                </div>
                <div className="settings-group">
                  <div className="settings-label">Auto-verify (rank up)</div>
                  <label className="settings-option" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={demoAutoVerify}
                      onChange={(event) => setDemoAutoVerify(event.target.checked)}
                    />
                    <span>After upload, verify capture as admin</span>
                  </label>
                  <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    <div className="muted">Admin token (X-Admin-Token)</div>
                    <input
                      type="password"
                      value={demoAdminToken}
                      onChange={(event) => setDemoAdminToken(event.target.value)}
                      placeholder="Paste ADMIN_API_TOKEN (or set VITE_ADMIN_API_TOKEN)"
                    />
                  </label>
                </div>
                <div className="settings-group">
                  <div className="settings-label">Session</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => void handleNewDemoUser()}
                      disabled={demoDeviceLocked}
                    >
                      New demo user
                    </button>
                  </div>
                  {demoDeviceLocked ? (
                    <div className="muted" style={{ marginTop: 6 }}>
                      Demo device is locked via VITE_DEMO_DEVICE_ID.
                    </div>
                  ) : null}
                </div>
              </div>
            </details>
          </div>
        ) : null}
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
              <Marker
                key={n.id}
                position={{ lat: n.lat, lng: n.lng }}
                onClick={() => {
                  setSelectedNodeId(n.id);
                  void handleRequestDirections(n);
                }}
              />
            ))}
            {activeUserLocation ? (
              <Marker
                position={activeUserLocation}
                title={demoMode && puppetEnabled ? "Puppet location" : "Your location"}
                draggable={demoMode && puppetEnabled}
                zIndex={999}
                onDrag={(event) => {
                  if (!demoMode || !puppetEnabled) return;
                  const latLng = event.latLng;
                  if (!latLng) return;
                  setPuppetLocationFromLatLng({ lat: latLng.lat(), lng: latLng.lng() });
                }}
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

      {selectedNode ? (
        <div className="node-modal" role="dialog" aria-label={`${selectedNode.name} details`}>
          <div className="node-modal-header">
            <div>
              <div className="node-modal-title">{selectedNode.name}</div>
              <div className="muted">{selectedNode.category}</div>
            </div>
            <button
              type="button"
              className="icon-button node-close"
              onClick={() => setSelectedNodeId(null)}
              aria-label="Close node details"
            >
              ✕
            </button>
          </div>
          {selectedNode.description ? <div className="node-modal-body">{selectedNode.description}</div> : null}
          <div className="node-meta-grid">
            <div>
              <div className="node-meta-label">Radius</div>
              <div>{formatMeters(selectedNode.radius_m)}</div>
            </div>
          </div>
          <div className="node-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => void handleCheckIn()}
              disabled={checkinState === "requesting_location" || checkinState === "challenging" || checkinState === "verifying"}
            >
              {checkinState === "requesting_location" || checkinState === "challenging" || checkinState === "verifying"
                ? "Checking in..."
                : "Check in"}
            </button>
            <button type="button" className="button-secondary" onClick={() => void handleRequestDirections()}>
              Directions
            </button>
            {directionsUrl ? (
              <a className="button-secondary" href={directionsUrl} target="_blank" rel="noreferrer">
                Open in Google Maps
              </a>
            ) : null}
          </div>
          {checkinState === "success" && checkinToken ? (
            <div className="node">
              <div>Checked in.</div>
              <div className="muted">Token: {checkinToken}</div>
            </div>
          ) : null}
          {checkinFailure ? (
            <div className="alert">
              <div>{checkinFailure.title}</div>
              {checkinFailure.detail ? <div className="muted">{checkinFailure.detail}</div> : null}
              {checkinFailure.nextStep ? <div className="muted">{checkinFailure.nextStep}</div> : null}
              <div className="node-actions">
                <button type="button" className="button-secondary" onClick={() => void handleRequestDirections()}>
                  Get directions
                </button>
              </div>
            </div>
          ) : null}
          {statusMessage ? <div className="alert">{statusMessage}</div> : null}
          {selectedNode.image_url ? (
            <button
              type="button"
              className="node-image-preview"
              onClick={() => setImageExpanded(true)}
              aria-label="View node image"
            >
              <img src={selectedNode.image_url} alt={selectedNode.name} loading="lazy" />
              <span>Tap to enlarge</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {imageExpanded && selectedNode?.image_url ? (
        <div className="modal-backdrop" onClick={() => setImageExpanded(false)} role="presentation">
          <div className="image-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <img src={selectedNode.image_url} alt={selectedNode.name} />
            {selectedNode.image_attribution ? (
              <div className="muted">Image credit: {selectedNode.image_attribution}</div>
            ) : null}
            {selectedNode.image_source_url ? (
              <a href={selectedNode.image_source_url} target="_blank" rel="noreferrer">
                View source
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="modal-backdrop" onClick={handleCloseSettings} role="presentation">
          <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <strong>Account & Settings</strong>
                <div className="muted">{isCreatorSurface ? "Creator surface" : "Explorer surface"}</div>
              </div>
              <button type="button" className="button-secondary" onClick={handleCloseSettings}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <div className="modal-title">Navigation</div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className={isCreatorSurface ? "button-primary" : "button-secondary"}
                    onClick={() => {
                      navigate("/map");
                      setSettingsOpen(false);
                    }}
                    disabled={!isCreatorSurface}
                  >
                    Explorer map
                  </button>
                  <button
                    type="button"
                    className={isCreatorSurface ? "button-secondary" : "button-primary"}
                    onClick={() => {
                      navigate("/creator");
                      setSettingsOpen(false);
                    }}
                    disabled={isCreatorSurface}
                  >
                    Creator tools
                  </button>
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-title">Theme</div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className={themeMode === "light" ? "button-primary" : "button-secondary"}
                    onClick={() => setThemeMode("light")}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    className={themeMode === "dark" ? "button-primary" : "button-secondary"}
                    onClick={() => setThemeMode("dark")}
                  >
                    Dark
                  </button>
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-title">Profile</div>
                {viewMe ? (
                  <div className="node">
                    <div className="node-header">
                      <RankBadge rank={viewMe.rank} pulseKey={rankPulseKey} />
                      <div className="node-actions">
                        <button
                          type="button"
                          className="button-primary"
                          onClick={() => refreshMe(true)}
                          disabled={meStatus === "loading"}
                        >
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
              </div>

              {isCreatorSurface ? (
                <div className="modal-section">
                  <div className="modal-title">Notifications</div>
                  <div className="node node-compact">
                    <div className="node-header">
                      <div>
                        <div className="muted">Inbox</div>
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
                        <button
                          className="button-primary button-compact"
                          onClick={handleRefreshNotifications}
                          disabled={notificationsStatus === "loading"}
                        >
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
                                    className="button-secondary"
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
                </div>
              ) : null}

              <div className="modal-section">
                <div className="modal-title">Map settings</div>
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
                    {MAP_STYLE_PRESETS[mapStylePreset].description ? (
                      <div className="muted">{MAP_STYLE_PRESETS[mapStylePreset].description}</div>
                    ) : null}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      ) : null}

      <RankUpOverlay event={rankUpEvent} onDismiss={dismissRankUp} />
      <ToastStack toasts={toasts} onDismiss={(toastId) => setToasts((prev) => prev.filter((t) => t.id !== toastId))} />
    </div>
  );
}
