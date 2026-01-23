import React, { useEffect, useMemo, useRef, useState } from "react";
import { isApiError } from "../../api/http";
import { createCapture, uploadCaptureImage } from "./api";
import {
  buildCaptureAsset,
  buildCaptureIntent,
  type CaptureAsset,
  type CaptureFailure,
  type CaptureFlowStatus,
  type CaptureIntent
} from "./captureFlowState";

type CaptureFlowProps = {
  nodeId: string;
  nodeName?: string;
  checkinToken: string | null;
  onDone?: (captureId: string) => void;
  onCancel?: () => void;
};

type FailureStage = "submitting" | "uploading" | null;

export function CaptureFlow({ nodeId, nodeName, checkinToken, onDone, onCancel }: CaptureFlowProps) {
  const [status, setStatus] = useState<CaptureFlowStatus>("capturing");
  const [asset, setAsset] = useState<CaptureAsset | null>(null);
  const [intent, setIntent] = useState<CaptureIntent | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [failure, setFailure] = useState<CaptureFailure | null>(null);
  const [failureStage, setFailureStage] = useState<FailureStage>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrl = useMemo(() => (asset ? URL.createObjectURL(asset.blob) : null), [asset]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!checkinToken) {
      setStatus("failure");
      setFailure({
        title: "Missing check-in token",
        detail: "Return to the map and check in before capturing."
      });
    }
  }, [checkinToken]);

  function resetToCapture() {
    setStatus("capturing");
    setAsset(null);
    setIntent(null);
    setCaptureId(null);
    setFailure(null);
    setFailureStage(null);
  }

  function handleTriggerCamera() {
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const nextAsset = buildCaptureAsset(file);
    setAsset(nextAsset);
    if (checkinToken) setIntent(buildCaptureIntent(nodeId, checkinToken));
    setFailure(null);
    setFailureStage(null);
    setStatus("preview");
  }

  function handleRetake() {
    resetToCapture();
  }

  async function handleUploadWithCapture(existingCaptureId: string, file: File) {
    setStatus("uploading");
    await uploadCaptureImage(existingCaptureId, file);
    setStatus("success");
    setFailure(null);
    setFailureStage(null);
    if (onDone) onDone(existingCaptureId);
  }

  async function handleSubmit() {
    if (!checkinToken) {
      setStatus("failure");
      setFailure({
        title: "Missing check-in token",
        detail: "Return to the map and check in before submitting."
      });
      return;
    }
    if (!asset) {
      setStatus("failure");
      setFailure({
        title: "No photo selected",
        detail: "Take a photo before submitting."
      });
      return;
    }

    setFailure(null);
    setFailureStage(null);
    setStatus("submitting");
    try {
      const created = await createCapture({
        node_id: nodeId,
        checkin_token: checkinToken
      });
      setCaptureId(created.capture.id);
      setFailureStage("uploading");
      try {
        await handleUploadWithCapture(created.capture.id, asset.file);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus("failure");
        setFailureStage("uploading");
        setFailure({
          title: "Upload failed",
          detail: message,
          nextStep: "Retry the upload or retake the photo."
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("failure");
      setFailureStage("submitting");
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
    if (!checkinToken) return;
    if (!asset) {
      resetToCapture();
      return;
    }
    if (failureStage === "uploading" && captureId) {
      try {
        await handleUploadWithCapture(captureId, asset.file);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus("failure");
        setFailureStage("uploading");
        setFailure({
          title: "Upload failed",
          detail: message,
          nextStep: "Retry the upload or retake the photo."
        });
      }
      return;
    }
    await handleSubmit();
  }

  async function handleUploadFromPreview() {
    if (!asset) return;
    if (!checkinToken) {
      setFailure({
        title: "Missing check-in token",
        detail: "Return to the map and check in before submitting."
      });
      setStatus("failure");
      return;
    }
    if (captureId) {
      try {
        await handleUploadWithCapture(captureId, asset.file);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus("failure");
        setFailureStage("uploading");
        setFailure({
          title: "Upload failed",
          detail: message,
          nextStep: "Retry the upload or retake the photo."
        });
      }
      return;
    }
    await handleSubmit();
  }

  function describeState() {
    if (status === "capturing") return "Ready to capture";
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

      {status === "capturing" ? (
        <div style={{ marginTop: 12 }}>
          <div className="muted">Use your camera to capture the node.</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleTriggerCamera} disabled={!checkinToken}>
              Take photo
            </button>
            {onCancel ? <button onClick={onCancel}>Cancel</button> : null}
          </div>
          {!checkinToken ? (
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
            <button onClick={handleUploadFromPreview} disabled={!checkinToken}>
              Submit
            </button>
            <button onClick={handleRetake}>Retake</button>
            {onCancel ? <button onClick={onCancel}>Cancel</button> : null}
          </div>
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
          <div>Uploading your photo…</div>
          <div className="muted">Uploads can take longer on weak networks.</div>
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
            {onCancel ? <button onClick={onCancel}>Back to map</button> : null}
          </div>
        </div>
      ) : null}

      {status === "failure" && failure ? (
        <div className="alert" style={{ marginTop: 12 }}>
          <div>{failure.title}</div>
          {failure.detail ? <div className="muted">{failure.detail}</div> : null}
          {failure.nextStep ? <div className="muted">{failure.nextStep}</div> : null}
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleRetry} disabled={!checkinToken}>
              Retry
            </button>
            <button onClick={handleRetake}>Retake</button>
            {onCancel ? <button onClick={onCancel}>Cancel</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
