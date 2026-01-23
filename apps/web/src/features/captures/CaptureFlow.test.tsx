import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureFlow } from "./CaptureFlow";

const mockQueue = {
  initialized: true,
  persistenceError: undefined as string | undefined,
  items: [] as any[],
  pendingCount: 0,
  uploadingCount: 0,
  failedCount: 0,
  enqueue: vi.fn(),
  retryNow: vi.fn(),
  remove: vi.fn()
};

vi.mock("./useUploadQueue", () => ({
  useUploadQueue: () => mockQueue
}));

afterEach(() => {
  mockQueue.items = [];
  mockQueue.enqueue.mockReset();
  mockQueue.retryNow.mockReset();
  mockQueue.remove.mockReset();
});

describe("CaptureFlow", () => {
  it("renders upload progress from the queue", async () => {
    const captureId = "cap_123456789";
    mockQueue.items = [
      {
        captureId,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        size: 2000,
        status: "uploading",
        attemptCount: 1,
        progress: { loaded: 50, total: 100 }
      }
    ];

    render(<CaptureFlow nodeId="node_1" checkinToken="token" captureId={captureId} />);

    await waitFor(() => expect(screen.getByText("Uploading your photo…")).toBeInTheDocument());
    expect(screen.getByText("50% uploaded")).toBeInTheDocument();
  });

  it("surfaces upload failures from the queue", async () => {
    const captureId = "cap_failed";
    mockQueue.items = [
      {
        captureId,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        size: 2000,
        status: "failed",
        attemptCount: 2,
        lastError: { code: "auth_required", message: "Auth required" }
      }
    ];

    render(<CaptureFlow nodeId="node_1" checkinToken="token" captureId={captureId} />);

    await waitFor(() => expect(screen.getByText("Upload failed")).toBeInTheDocument());
    expect(screen.getByText(/auth_required/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
