import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  IMAGE_PREPROCESS_MAX_BYTES,
  IMAGE_PREPROCESS_TARGET_MIME,
  ImagePreprocessError,
  preprocessCaptureImage
} from "./imagePreprocess";

type CanvasContextStub = {
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  fillStyle: string;
};

type CanvasStub = {
  width: number;
  height: number;
  getContext: Mock<[contextId: string], CanvasContextStub>;
  toBlob: Mock<[cb: BlobCallback, mime?: string, quality?: any], void>;
};

function ensureFileAvailable() {
  if (typeof File !== "undefined") return;
  class TestFile extends Blob {
    name: string;
    lastModified: number;

    constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
      super(parts, options);
      this.name = name;
      this.lastModified = options?.lastModified ?? Date.now();
    }
  }
  vi.stubGlobal("File", TestFile);
}

function makeFile(type: string, name = "photo.png") {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function stubCanvas(sizeForQuality: (quality: number, width: number, height: number) => number) {
  const ctx: CanvasContextStub = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
    fillStyle: "#ffffff"
  };
  const canvas: CanvasStub = {
    width: 0,
    height: 0,
    getContext: vi.fn((_contextId: string) => ctx),
    toBlob: vi.fn((cb: BlobCallback, mime?: string, quality?: any) => {
      const nextQuality = typeof quality === "number" ? quality : 0.92;
      const size = sizeForQuality(nextQuality, canvas.width, canvas.height);
      cb(new Blob([new Uint8Array(size)], { type: mime ?? "" }));
    })
  };
  vi.stubGlobal("document", {
    createElement: vi.fn(() => canvas)
  });
  return { canvas, ctx };
}

function stubCreateImageBitmap(width = 4000, height = 3000) {
  const bitmap = { width, height, close: vi.fn() };
  const createImageBitmap = vi.fn().mockResolvedValue(bitmap);
  vi.stubGlobal("createImageBitmap", createImageBitmap);
  return { bitmap, createImageBitmap };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preprocessCaptureImage", () => {
  beforeEach(() => {
    ensureFileAvailable();
  });

  it("re-encodes with orientation-aware decode when available", async () => {
    const { createImageBitmap } = stubCreateImageBitmap();
    stubCanvas(() => 480_000);

    const result = await preprocessCaptureImage(makeFile("image/png"));

    expect(createImageBitmap).toHaveBeenCalledWith(expect.any(File), {
      imageOrientation: "from-image"
    });
    expect(result.mimeType).toBe(IMAGE_PREPROCESS_TARGET_MIME);
    expect(result.file.type).toBe(IMAGE_PREPROCESS_TARGET_MIME);
    expect(result.fileName.endsWith(".jpg")).toBe(true);
    expect(result.size).toBeLessThanOrEqual(IMAGE_PREPROCESS_MAX_BYTES);
  });

  it("reduces quality until size is under the limit", async () => {
    stubCreateImageBitmap(3000, 2000);
    const { canvas } = stubCanvas((quality) => (quality > 0.7 ? IMAGE_PREPROCESS_MAX_BYTES + 1 : 900_000));

    const result = await preprocessCaptureImage(makeFile("image/jpeg", "photo.jpg"));

    expect(result.size).toBeLessThanOrEqual(IMAGE_PREPROCESS_MAX_BYTES);
    expect(canvas.toBlob).toHaveBeenCalled();
  });

  it("reports unsupported input types", async () => {
    stubCreateImageBitmap();
    stubCanvas(() => 100_000);

    await expect(preprocessCaptureImage(makeFile("application/pdf", "doc.pdf"))).rejects.toMatchObject({
      code: "unsupported_type"
    });
    await expect(preprocessCaptureImage(makeFile("application/pdf", "doc.pdf"))).rejects.toBeInstanceOf(
      ImagePreprocessError
    );
  });
});
