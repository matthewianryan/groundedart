export const IMAGE_PREPROCESS_MAX_DIMENSION = 1600;
export const IMAGE_PREPROCESS_TARGET_MIME = "image/jpeg";
export const IMAGE_PREPROCESS_MAX_BYTES = 1_500_000;

const INITIAL_JPEG_QUALITY = 0.86;
const MIN_JPEG_QUALITY = 0.6;
const QUALITY_STEP = 0.08;
const RESIZE_STEP = 0.85;
const MIN_DIMENSION = 640;

export type ImagePreprocessErrorCode = "unsupported_type" | "decode_failed" | "encode_failed" | "too_large";

export class ImagePreprocessError extends Error {
  code: ImagePreprocessErrorCode;

  constructor(code: ImagePreprocessErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type ImagePreprocessResult = {
  blob: Blob;
  file: File;
  fileName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  originalSize: number;
};

type DecodedImage = {
  image: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  cleanup: () => void;
};

export async function preprocessCaptureImage(file: File): Promise<ImagePreprocessResult> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new ImagePreprocessError("unsupported_type", "Unsupported file type.");
  }

  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file);
  } catch (err) {
    throw new ImagePreprocessError(
      "decode_failed",
      err instanceof Error ? err.message : "Unable to decode image."
    );
  }

  try {
    const result = await encodeImage(decoded, file);
    return result;
  } finally {
    decoded.cleanup();
  }
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close?.()
    };
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  return {
    image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    cleanup: () => {}
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

async function encodeImage(decoded: DecodedImage, file: File): Promise<ImagePreprocessResult> {
  const maxDimension = IMAGE_PREPROCESS_MAX_DIMENSION;
  let targetWidth = decoded.width;
  let targetHeight = decoded.height;

  const maxSide = Math.max(decoded.width, decoded.height);
  if (maxSide > maxDimension) {
    const scale = maxDimension / maxSide;
    targetWidth = Math.max(1, Math.round(decoded.width * scale));
    targetHeight = Math.max(1, Math.round(decoded.height * scale));
  }

  let attemptWidth = targetWidth;
  let attemptHeight = targetHeight;

  for (;;) {
    const canvas = createCanvas(attemptWidth, attemptHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new ImagePreprocessError("encode_failed", "Canvas unavailable for image processing.");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, attemptWidth, attemptHeight);
    ctx.drawImage(decoded.image, 0, 0, attemptWidth, attemptHeight);

    let quality = INITIAL_JPEG_QUALITY;
    while (quality >= MIN_JPEG_QUALITY) {
      const blob = await canvasToBlob(canvas, IMAGE_PREPROCESS_TARGET_MIME, quality);
      if (!blob) {
        throw new ImagePreprocessError("encode_failed", "Failed to encode image.");
      }

      if (blob.size <= IMAGE_PREPROCESS_MAX_BYTES) {
        const fileName = replaceExtension(file.name, "jpg");
        const outputFile = new File([blob], fileName, { type: IMAGE_PREPROCESS_TARGET_MIME });
        return {
          blob,
          file: outputFile,
          fileName,
          mimeType: IMAGE_PREPROCESS_TARGET_MIME,
          size: blob.size,
          width: attemptWidth,
          height: attemptHeight,
          originalSize: file.size
        };
      }

      quality = Math.max(0, quality - QUALITY_STEP);
    }

    const nextWidth = Math.max(1, Math.round(attemptWidth * RESIZE_STEP));
    const nextHeight = Math.max(1, Math.round(attemptHeight * RESIZE_STEP));
    if (Math.max(nextWidth, nextHeight) < MIN_DIMENSION) {
      break;
    }
    attemptWidth = nextWidth;
    attemptHeight = nextHeight;
  }

  throw new ImagePreprocessError("too_large", "Photo is too large to compress for upload.");
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function replaceExtension(name: string, nextExt: string) {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0) return `${name}.${nextExt}`;
  return `${name.slice(0, lastDot)}.${nextExt}`;
}
