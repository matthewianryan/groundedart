export type CaptureFlowStatus =
  | "capturing"
  | "processing"
  | "preview"
  | "submitting"
  | "uploading"
  | "success"
  | "failure";

export type CaptureIntent = {
  nodeId: string;
  checkinToken: string;
  capturedAt: string;
};

export type CaptureAsset = {
  blob: Blob;
  file: File;
  fileName: string;
  contentType: string;
  size: number;
};

export type CaptureFailure = {
  title: string;
  detail?: string;
  nextStep?: string;
};

export function buildCaptureIntent(nodeId: string, checkinToken: string): CaptureIntent {
  return {
    nodeId,
    checkinToken,
    capturedAt: new Date().toISOString()
  };
}

export function buildCaptureAsset(file: File): CaptureAsset {
  return {
    blob: file,
    file,
    fileName: file.name,
    contentType: file.type || "image/*",
    size: file.size
  };
}
