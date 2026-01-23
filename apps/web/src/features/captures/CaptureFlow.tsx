import React, { useEffect, useMemo, useRef, useState } from "react";
import { isApiError } from "../../api/http";
import { createCapture } from "./api";
import { type CaptureAsset, type CaptureFailure, type CaptureFlowStatus, type CaptureIntent } from "./captureFlowState";
import { clearActiveCaptureDraft, saveActiveCaptureDraft } from "./captureDraftStore";
import {
  ImagePreprocessError,
  IMAGE_PREPROCESS_MAX_BYTES,
  preprocessCaptureImage
} from "./imagePreprocess";
import { useUploadQueue } from "./useUploadQueue";

type CaptureFlowProps = {
  nodeId: string;
  nodeName?: string;
  checkinToken: string | null;
  captureId?: string | null;
  initialAsset?: CaptureAsset | null;
  initialIntent?: CaptureIntent | null;
  onCaptureCreated?: (captureId: string) => void;
  onDone?: (captureId: string) => void;
  onCancel?: () => void;
};

type FailureStage = "submitting" | "persisting" | "uploading" | null;

export function CaptureFlow({
  nodeId,
  nodeName,
  checkinToken,
  captureId: initialCaptureId,
  initialAsset,
  initialIntent,
  onCaptureCreated,
  onDone,
  onCancel
}: CaptureFlowProps) {
  const [status, setStatus] = useState<CaptureFlowStatus>("capturing");
  const [asset, setAsset] = useState<CaptureAsset | null>(initialAsset ?? null);
  const [intent, setIntent] = useState<CaptureIntent | null>(initialIntent ?? null);
  const [captureId, setCaptureId] = useState<string | null>(initialCaptureId ?? null);
  const [failure, setFailure] = useState<CaptureFailure | null>(null);
  const [failureStage, setFailureStage] = useState<FailureStage>(null);
  const [isEnqueued, setIsEnqueued] = useState(false);
  const [draftWarning, setDraftWarning] = useState<string | null>(null);
  const submitLock = useRef(false);
  const uploadQueue = useUploadQueue();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const preprocessToken = useRef(0);
  const previewUrl = useMemo(() => (asset ? URL.createObjectURL(asset.blob) : null), [asset]);
  const queuedItem = useMemo(
    () => (captureId ? uploadQueue.items.find((i) => i.captureId === captureId) ?? null : null),
    [captureId, uploadQueue.items]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!checkinToken && !captureId) {
      setStatus("failure");
      setFailure({
        title: "Missing check-in token",
        detail: "Return to the map and check in before capturing."
      });
    }
  }, [checkinToken, captureId]);

  useEffect(() => {
    if (initialCaptureId && initialCaptureId !== captureId) {
      setCaptureId(initialCaptureId);
    }
  }, [initialCaptureId, captureId]);

  useEffect(() => {
    if (!initialAsset || asset) return;
    setAsset(initialAsset);
    setIntent(initialIntent ?? null);
    setStatus("preview");
  }, [asset, initialAsset, initialIntent]);

  useEffect(() => {
    if (!captureId || !queuedItem || isEnqueued) return;
    setIsEnqueued(true);
  }, [captureId, queuedItem, isEnqueued]);

  function resetToCapture() {
    setStatus("capturing");
    setAsset(null);
    setIntent(null);
    setFailure(null);
    setFailureStage(null);
    setIsEnqueued(false);
    setDraftWarning(null);
    submitLock.current = false;
    void clearActiveCaptureDraft().catch(() => undefined);
  }

  function handleTriggerCamera() {
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    preprocessToken.current += 1;
    const token = preprocessToken.current;
    setFailure(null);
    setFailureStage(null);
    setStatus("processing");
    try {
      const processed = await preprocessCaptureImage(file);
      if (token !== preprocessToken.current) return;
      const capturedAt = new Date().toISOString();
      const processedAsset = {
        blob: processed.blob,
        file: processed.file,
        fileName: processed.fileName,
        contentType: processed.mimeType,
        size: processed.size
      };
      setAsset(processedAsset);
      if (checkinToken) {
        setIntent({ nodeId, checkinToken, capturedAt });
      }
      if (checkinToken && !captureId) {
        try {
          await saveActiveCaptureDraft({
            nodeId,
            nodeName,
            checkinToken,
            capturedAt,
            blob: processedAsset.blob,
            fileName: processedAsset.fileName,
            mimeType: processedAsset.contentType,
            size: processedAsset.size
          });
          setDraftWarning(null);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setDraftWarning(message);
        }
      }
      setStatus("preview");
    } catch (err) {
      if (token !== preprocessToken.current) return;
      setStatus("failure");
      setFailureStage(null);
      if (err instanceof ImagePreprocessError) {
        const detail =
          err.code === "unsupported_type"
            ? "Use a JPG, PNG, or WebP photo."
            : err.code === "decode_failed"
              ? "Retake the photo or choose a different image."
              : err.code === "too_large"
                ? `Try again with a smaller photo (target ${Math.round(
                    IMAGE_PREPROCESS_MAX_BYTES / 1024
                  )} KB or less).`
                : "Please retake the photo.";
        setFailure({
          title: "Photo processing failed",
          detail: err.message,
          nextStep: detail
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setFailure({
        title: "Photo processing failed",
        detail: message,
        nextStep: "Retake the photo or choose another image."
      });
    }
  }

  async function handleRetake() {
    if (captureId) {
      try {
        await uploadQueue.remove(captureId);
      } catch {
        // Ignore failures; the next submit will attempt to enqueue again.
      }
    }
    resetToCapture();
  }

  async function handleSubmit() {
    if (!asset) {
      setStatus("failure");
      setFailure({
        title: "No photo selected",
        detail: "Take a photo before submitting."
      });
      return;
    }

    if (submitLock.current) return;
    submitLock.current = true;
    setFailure(null);
    setFailureStage(null);

    if (captureId) {
      setStatus("uploading");
      setFailureStage("uploading");
      try {
        await uploadQueue.enqueue({
          captureId,
          blob: asset.blob,
          fileName: asset.fileName,
          mimeType: asset.contentType,
          createdAt: new Date().toISOString()
        });
        setIsEnqueued(true);
        await uploadQueue.retryNow(captureId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus("failure");
        setFailureStage("uploading");
        setFailure({
          title: "Upload failed",
          detail: message,
          nextStep: "Try again once you have a stable connection."
        });
        submitLock.current = false;
      }
      return;
    }

    if (!checkinToken) {
      setStatus("failure");
      setFailure({
        title: "Missing check-in token",
        detail: "Return to the map and check in before submitting."
      });
      submitLock.current = false;
      return;
    }

    setStatus("submitting");
    try {
      const created = await createCapture({
        node_id: nodeId,
        checkin_token: checkinToken
      });
      setCaptureId(created.capture.id);
      onCaptureCreated?.(created.capture.id);
      setDraftWarning(null);
      void clearActiveCaptureDraft().catch(() => undefined);
      setStatus("uploading");
      setFailureStage("persisting");
      try {
        await uploadQueue.enqueue({
          captureId: created.capture.id,
          blob: asset.blob,
          fileName: asset.fileName,
          mimeType: asset.contentType,
          createdAt: new Date().toISOString()
        });
        setIsEnqueued(true);
        setFailureStage("uploading");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus("failure");
        setFailureStage("persisting");
        setFailure({
          title: "Could not save upload intent",
          detail: message,
          nextStep: "Free up storage (or exit private browsing) and retry."
        });
        submitLock.current = false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("failure");
      setFailureStage("submitting");
      submitLock.current = false;
      if (isApiError(err)) {
        setFailure({
          title: "Capture creation failed",
          detail: err.message,
          nextStep: "Retry once your check-in is valid."
        });
        return;
      }
      setFailure({
        title: "Capture creation failed",
        detail: message,
        nextStep: "Retry once you are online."
      });
    }
  }

  async function handleRetry() {
    if (!asset && !captureId) {
      resetToCapture();
      return;
    }
    if ((failureStage === "persisting" || failureStage === "uploading") && captureId) {
      setStatus("uploading");
      setFailure(null);
      setFailureStage("uploading");
      submitLock.current = true;
      try {
        if (!isEnqueued && asset) {
          await uploadQueue.enqueue({
            captureId,
            blob: asset.blob,
            fileName: asset.fileName,
            mimeType: asset.contentType,
            createdAt: new Date().toISOString()
          });
          setIsEnqueued(true);
        }
        await uploadQueue.retryNow(captureId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus("failure");
        setFailureStage("uploading");
        setFailure({
          title: "Retry failed",
          detail: message,
          nextStep: "Try again once you have a stable connection."
        });
        submitLock.current = false;
      }
      return;
    }
    await handleSubmit();
  }

  async function handleUploadFromPreview() {
    if (status !== "preview") return;
    await handleSubmit();
  }

  useEffect(() => {
    if (!captureId || !isEnqueued) return;

    if (!queuedItem) {
      setStatus("success");
      setFailure(null);
      setFailureStage(null);
      return;
    }

    if (queuedItem.status === "failed") {
      const detail = queuedItem.lastError?.code
        ? `${queuedItem.lastError.code}: ${queuedItem.lastError.message}`
        : queuedItem.lastError?.message;
      setStatus("failure");
      setFailureStage("uploading");
      setFailure({
        title: "Upload failed",
        detail: detail ?? "Upload failed.",
        nextStep: "Retry the upload once you have a stable connection."
      });
      submitLock.current = false;
      return;
    }

    setStatus("uploading");
    setFailure(null);
    setFailureStage("uploading");
  }, [captureId, isEnqueued, queuedItem]);

  function handleCancelAction() {
    void clearActiveCaptureDraft().catch(() => undefined);
    onCancel?.();
  }

  function describeState() {
    if (status === "capturing") return "Ready to capture";
    if (status === "processing") return "Processing photo";
    if (status === "preview") return "Review your photo";
    if (status === "submitting") return "Creating capture";
    if (status === "uploading") return "Uploading photo";
    if (status === "success") return "Capture uploaded";
    if (status === "failure") return "Action needed";
    return "Unknown";
  }

  const intentSummary = intent
    ? `Intent: node ${intent.nodeId} at ${new Date(intent.capturedAt).toLocaleTimeString()}`
    : "Intent: none yet";

  return (
    <div className="capture-flow">
      <div className="capture-header">
        <div>
          <div className="muted">Capture flow state</div>
          <div>{describeState()}</div>
        </div>
        <div className="muted">{nodeName ? `Node: ${nodeName}` : `Node: ${nodeId}`}</div>
      </div>

      <div className="muted" style={{ marginTop: 8 }}>
        {intentSummary}
      </div>

      {draftWarning ? (
        <div className="alert" style={{ marginTop: 12 }}>
          <div>Local fallback unavailable</div>
          <div className="muted">{draftWarning}</div>
          <div className="muted">Keep this tab open until the capture is created.</div>
        </div>
      ) : null}

      {status === "capturing" ? (
        <div style={{ marginTop: 12 }}>
          <div className="muted">Use your camera to capture the node.</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleTriggerCamera} disabled={!checkinToken && !captureId}>
              Take photo
            </button>
            {onCancel ? <button onClick={handleCancelAction}>Cancel</button> : null}
          </div>
          {!checkinToken && !captureId ? (
            <div className="alert" style={{ marginTop: 8 }}>
              <div>Check-in required</div>
              <div className="muted">Return to the map to check in before capturing.</div>
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      ) : null}

      {status === "preview" && asset ? (
        <div style={{ marginTop: 12 }}>
          {previewUrl ? <img src={previewUrl} alt="Capture preview" className="capture-preview" /> : null}
          <div className="muted" style={{ marginTop: 8 }}>
            {asset.size ? `${Math.round(asset.size / 1024)} KB` : null}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleUploadFromPreview} disabled={(!checkinToken && !captureId) || submitLock.current}>
              Submit
            </button>
            <button onClick={handleRetake}>Retake</button>
            {onCancel ? <button onClick={handleCancelAction}>Cancel</button> : null}
          </div>
        </div>
      ) : null}

      {status === "processing" ? (
        <div style={{ marginTop: 12 }}>
          <div>Processing your photo…</div>
          <div className="muted">We resize and strip metadata before upload.</div>
        </div>
      ) : null}

      {status === "submitting" ? (
        <div style={{ marginTop: 12 }}>
          <div>Creating capture record…</div>
          <div className="muted">Keep this tab open while we submit.</div>
        </div>
      ) : null}

      {status === "uploading" ? (
        <div style={{ marginTop: 12 }}>
          <div>
            {queuedItem?.status === "pending"
              ? "Queued for upload…"
              : queuedItem?.status === "uploading"
                ? "Uploading your photo…"
                : "Preparing upload…"}
          </div>
          {queuedItem?.status === "pending" && queuedItem.nextAttemptAt ? (
            <div className="muted">Next retry: {new Date(queuedItem.nextAttemptAt).toLocaleTimeString()}</div>
          ) : queuedItem?.progress?.total ? (
            <div className="muted">
              {Math.min(100, Math.round((queuedItem.progress.loaded / queuedItem.progress.total) * 100))}% uploaded
            </div>
          ) : (
            <div className="muted">Uploads can take longer on weak networks.</div>
          )}
          {!navigator.onLine ? <div className="muted">Offline — upload will resume when you reconnect.</div> : null}
        </div>
      ) : null}

      {status === "success" ? (
        <div className="alert" style={{ marginTop: 12 }}>
          <div>Upload complete</div>
          <div className="muted">Capture {captureId ? `${captureId.slice(0, 8)}…` : "ready"} is pending review.</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onDone ? (
              <button onClick={() => onDone(captureId ?? "")} disabled={!captureId}>
                Done
              </button>
            ) : null}
            {onCancel ? <button onClick={handleCancelAction}>Back to map</button> : null}
          </div>
        </div>
      ) : null}

      {status === "failure" && failure ? (
        <div className="alert" style={{ marginTop: 12 }}>
          <div>{failure.title}</div>
          {failure.detail ? <div className="muted">{failure.detail}</div> : null}
          {failure.nextStep ? <div className="muted">{failure.nextStep}</div> : null}
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleRetry} disabled={!checkinToken && !captureId}>
              Retry
            </button>
            <button onClick={handleRetake}>Retake</button>
            {onCancel ? <button onClick={handleCancelAction}>Cancel</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
