import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const listNodes = vi.fn();
const createCheckinChallenge = vi.fn();
const checkIn = vi.fn();
const getMe = vi.fn();
const listNotifications = vi.fn();
const markNotificationRead = vi.fn();

vi.mock("@react-google-maps/api", async () => {
  const ReactModule = await import("react");
  const OverlayView = ({ children }: any) => <div data-testid="overlay-view">{children}</div>;
  (OverlayView as any).OVERLAY_MOUSE_TARGET = "overlayMouseTarget";
  return {
    useJsApiLoader: () => ({ isLoaded: true, loadError: undefined }),
    GoogleMap: ({ children, onLoad, onIdle }: any) => {
      ReactModule.useEffect(() => {
        const bounds = {
          getSouthWest: () => ({ lat: () => 0, lng: () => 0 }),
          getNorthEast: () => ({ lat: () => 1, lng: () => 1 })
        };
        const map = { getBounds: () => bounds };
        onLoad?.(map);
        onIdle?.();
      }, [onLoad, onIdle]);
      return <div data-testid="map">{children}</div>;
    },
    Marker: ({ onClick }: any) => (
      <button type="button" data-testid="marker" onClick={onClick}>
        marker
      </button>
    ),
    OverlayView,
    DirectionsRenderer: () => <div data-testid="directions-renderer" />,
    DirectionsService: () => <div data-testid="directions-service" />
  };
});

vi.mock("../auth/session", () => ({
  ensureAnonymousSession: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../features/nodes/api", () => ({
  listNodes: (...args: unknown[]) => listNodes(...args)
}));

vi.mock("../features/checkin/api", () => ({
  createCheckinChallenge: (...args: unknown[]) => createCheckinChallenge(...args),
  checkIn: (...args: unknown[]) => checkIn(...args)
}));

vi.mock("../features/me/api", () => ({
  getMe: (...args: unknown[]) => getMe(...args)
}));

vi.mock("../features/notifications/api", () => ({
  listNotifications: (...args: unknown[]) => listNotifications(...args),
  markNotificationRead: (...args: unknown[]) => markNotificationRead(...args)
}));

vi.mock("../features/captures/useUploadQueue", () => ({
  useUploadQueue: () => ({
    initialized: true,
    persistenceError: undefined,
    items: [],
    pendingCount: 0,
    uploadingCount: 0,
    failedCount: 0,
    retryNow: vi.fn(),
    remove: vi.fn()
  })
}));

beforeAll(() => {
  (globalThis as any).google = {
    maps: {
      SymbolPath: { CIRCLE: 0 },
      TravelMode: { WALKING: "WALKING" }
    }
  };
});

beforeEach(() => {
  listNodes.mockReset();
  createCheckinChallenge.mockReset();
  checkIn.mockReset();
  getMe.mockReset();
  listNotifications.mockReset();
  markNotificationRead.mockReset();
  process.env.VITE_GOOGLE_MAPS_API_KEY = "test";
  Object.defineProperty(navigator, "geolocation", {
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback) =>
        success({
          coords: { latitude: 1, longitude: 2, accuracy: 9 },
          timestamp: Date.now()
        } as GeolocationPosition)
      )
    },
    configurable: true
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

async function renderMap() {
  const user = userEvent.setup();
  getMe.mockResolvedValue({
    user_id: "user_1",
    rank: 0,
    rank_version: "v1_points",
    rank_breakdown: {
      points_total: 0,
      verified_captures_total: 0,
      verified_captures_counted: 0,
      caps_applied: { per_node_per_day: 0, per_day_total: 0 }
    },
    next_unlock: { min_rank: 1, summary: "Unlocks Apprentice tier limits.", unlocks: [] }
  });
  listNotifications.mockResolvedValue({ notifications: [] });
  await vi.resetModules();
  const { MapRoute } = await import("./MapRoute");
  render(
    <MemoryRouter>
      <MapRoute />
    </MemoryRouter>
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  expect(listNodes).toHaveBeenCalled();
  const markers = await screen.findAllByTestId("marker");
  await user.click(markers[0]);
  return user;
}

describe("MapRoute", () => {
  it("shows check-in token after successful check-in", async () => {
    listNodes.mockResolvedValueOnce({
      nodes: [
        {
          id: "node_1",
          visibility: "visible",
          name: "Test node",
          category: "Mural",
          description: "",
          lat: 1,
          lng: 2,
          radius_m: 25,
          min_rank: 0
        }
      ]
    });
    createCheckinChallenge.mockResolvedValueOnce({
      challenge_id: "challenge_1",
      expires_at: "2024-01-01T00:00:00Z"
    });
    checkIn.mockResolvedValueOnce({
      checkin_token: "token_123456789",
      expires_at: "2024-01-01T00:10:00Z"
    });

    const user = await renderMap();

    await user.click(screen.getByRole("button", { name: "Check in" }));

    await waitFor(() => expect(checkIn).toHaveBeenCalled());
    expect(screen.getByText(/Token: token_12/)).toBeInTheDocument();
    expect(screen.getByText("Checked in.")).toBeInTheDocument();
  });

  it("surfaces accuracy guardrails from check-in errors", async () => {
    listNodes.mockResolvedValueOnce({
      nodes: [
        {
          id: "node_1",
          visibility: "visible",
          name: "Test node",
          category: "Mural",
          description: "",
          lat: 1,
          lng: 2,
          radius_m: 25,
          min_rank: 0
        }
      ]
    });
    createCheckinChallenge.mockResolvedValueOnce({
      challenge_id: "challenge_1",
      expires_at: "2024-01-01T00:00:00Z"
    });
    const user = await renderMap();

    const { ApiError } = await import("../api/http");
    checkIn.mockRejectedValueOnce(
      new ApiError(
        {
          code: "location_accuracy_too_low",
          message: "Accuracy too low",
          details: { accuracy_m: 80, max_allowed_m: 25 }
        },
        400
      )
    );

    await user.click(screen.getByRole("button", { name: "Check in" }));

    await waitFor(() => expect(screen.getByText("Location accuracy too low")).toBeInTheDocument());
    expect(screen.getByText("Accuracy 80m exceeds the 25m limit.")).toBeInTheDocument();
    expect(screen.getByText(/retry/)).toBeInTheDocument();
  });

  it("surfaces outside-geofence messaging", async () => {
    listNodes.mockResolvedValueOnce({
      nodes: [
        {
          id: "node_1",
          visibility: "visible",
          name: "Test node",
          category: "Mural",
          description: "",
          lat: 1,
          lng: 2,
          radius_m: 25,
          min_rank: 0
        }
      ]
    });
    createCheckinChallenge.mockResolvedValueOnce({
      challenge_id: "challenge_1",
      expires_at: "2024-01-01T00:00:00Z"
    });
    const user = await renderMap();

    const { ApiError } = await import("../api/http");
    checkIn.mockRejectedValueOnce(
      new ApiError(
        {
          code: "outside_geofence",
          message: "Outside geofence",
          details: { distance_m: 120, radius_m: 50 }
        },
        403
      )
    );

    await user.click(screen.getByRole("button", { name: "Check in" }));

    await waitFor(() => expect(screen.getByText("Not inside the zone")).toBeInTheDocument());
    expect(screen.getByText(/zone radius/)).toBeInTheDocument();
  });

  it("formats geolocation errors when requesting directions", async () => {
    listNodes.mockResolvedValueOnce({
      nodes: [
        {
          id: "node_1",
          visibility: "visible",
          name: "Test node",
          category: "Mural",
          description: "",
          lat: 1,
          lng: 2,
          radius_m: 25,
          min_rank: 0
        }
      ]
    });

    const user = await renderMap();

    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1, message: "User denied Geolocation" } as GeolocationPositionError)
        )
      },
      configurable: true
    });

    await user.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(screen.getByText("Location permission denied")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Get directions" }));

    await waitFor(() =>
      expect(screen.getByText(/Directions error: Location permission denied/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/\[object GeolocationPositionError\]/)).not.toBeInTheDocument();
  });

  it("falls back to a low-accuracy fix for directions when high accuracy fails", async () => {
    listNodes.mockResolvedValueOnce({
      nodes: [
        {
          id: "node_1",
          visibility: "visible",
          name: "Test node",
          category: "Mural",
          description: "",
          lat: 1,
          lng: 2,
          radius_m: 25,
          min_rank: 0
        }
      ]
    });

    const user = await renderMap();

    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce((_success: PositionCallback, error: PositionErrorCallback) =>
        error({ code: 2, message: "Position unavailable" } as GeolocationPositionError)
      )
      .mockImplementationOnce((success: PositionCallback) =>
        success({
          coords: { latitude: 1, longitude: 2, accuracy: 9 },
          timestamp: Date.now()
        } as GeolocationPosition)
      );

    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true
    });

    await user.click(screen.getByRole("button", { name: "Directions" }));

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(2));
    expect(getCurrentPosition.mock.calls[0]?.[2]).toMatchObject({ enableHighAccuracy: true });
    expect(getCurrentPosition.mock.calls[1]?.[2]).toMatchObject({ enableHighAccuracy: false });
    await waitFor(() => expect(screen.getByTestId("directions-service")).toBeInTheDocument());
  });

  it("offers a Google Maps link even before a GPS fix", async () => {
    listNodes.mockResolvedValueOnce({
      nodes: [
        {
          id: "node_1",
          visibility: "visible",
          name: "Test node",
          category: "Mural",
          description: "",
          lat: 1,
          lng: 2,
          radius_m: 25,
          min_rank: 0
        }
      ]
    });

    await renderMap();

    const link = screen.getByRole("link", { name: "Open in Google Maps" });
    expect(link.getAttribute("href")).toContain("destination=1%2C2");
  });
});
