import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadCaptureImageWithRetry } from "./api";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("uploadCaptureImageWithRetry", () => {
  it("retries on retryable errors and succeeds", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);

    const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({ error: { code: "upload_incomplete", message: "Server error" } })
        )
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "cap_1",
          node_id: "node_1",
          state: "pending_verification",
          created_at: "2024-01-01T00:00:00Z",
          image_url: null
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    const promise = uploadCaptureImageWithRetry("cap_1", file, {
      maxAttempts: 2,
      initialBackoffMs: 1,
      maxBackoffMs: 1
    });

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toMatchObject({ id: "cap_1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
