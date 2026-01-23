export const CAPTURE_UPLOADED_EVENT = "ga:capture-uploaded";
export const CAPTURE_VERIFIED_EVENT = "ga:capture-verified";

export type CaptureUploadedEventDetail = {
  captureId: string;
};

export type CaptureVerifiedEventDetail = {
  captureId: string;
};

export function dispatchCaptureUploadedEvent(captureId: string) {
  try {
    window.dispatchEvent(
      new CustomEvent<CaptureUploadedEventDetail>(CAPTURE_UPLOADED_EVENT, {
        detail: { captureId }
      })
    );
  } catch {
    // Ignore event dispatch failures (older browsers / restricted environments).
  }
}

export function dispatchCaptureVerifiedEvent(captureId: string) {
  try {
    window.dispatchEvent(
      new CustomEvent<CaptureVerifiedEventDetail>(CAPTURE_VERIFIED_EVENT, {
        detail: { captureId }
      })
    );
  } catch {
    // Ignore event dispatch failures (older browsers / restricted environments).
  }
}
