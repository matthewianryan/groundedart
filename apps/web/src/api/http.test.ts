import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it.each([400, 401, 403])("throws ApiError for HTTP %s", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: vi.fn().mockResolvedValue({
        error: { code: "auth_required", message: "Denied" }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/v1/me")).rejects.toMatchObject({
      code: "auth_required",
      status
    });
  });
});
