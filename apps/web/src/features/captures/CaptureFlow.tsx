import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isApiError } from "../../api/http";
import { formatNextUnlockLine, formatUnlockRequirement } from "../me/copy";
import { getMe } from "../me/api";
import type { MeResponse } from "../me/types";
import { createCapture, type CaptureRightsBasis } from "./api";
import { type CaptureAsset, type CaptureFailure, type CaptureFlowStatus, type CaptureIntent } from "./captureFlowState";
import { clearActiveCaptureDraft, saveActiveCaptureDraft } from "./captureDraftStore";
import {
  ImagePreprocessError,
  IMAGE_PREPROCESS_MAX_BYTES,
  preprocessCaptureImage
} from "./imagePreprocess";
import { useUploadQueue } from "./useUploadQueue";
import { Button, Card, Alert, Input, Select } from "../../components/ui";
import { fadeInUp, scaleIn, staggerContainer, staggerItem, defaultTransition } from "../../utils/animations";

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

function getNumberDetail(details: Record<string, unknown>, key: string): number | undefined {
  const value = details[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatWindow(windowSeconds?: number): string {
  if (!windowSeconds) return "this window";
  if (windowSeconds % 3600 === 0) {
    return `${windowSeconds / 3600}h`;
  }
  if (windowSeconds % 60 === 0) {
    return `${windowSeconds / 60}m`;
  }
  return `${windowSeconds}s`;
}

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
  const [me, setMe] = useState<MeResponse | null>(null);
  const [attributionArtistName, setAttributionArtistName] = useState("");
  const [attributionArtworkTitle, setAttributionArtworkTitle] = useState("");
  const [attributionSource, setAttributionSource] = useState("");
  const [attributionSourceUrl, setAttributionSourceUrl] = useState("");
  const [rightsBasis, setRightsBasis] = useState<CaptureRightsBasis | "">("");
  const [rightsAttestation, setRightsAttestation] = useState(false);
  const [publishRequested, setPublishRequested] = useState(false);
  const submitLock = useRef(false);
  const uploadQueue = useUploadQueue();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const preprocessToken = useRef(0);
  const previewUrl = useMemo(() => (asset ? URL.createObjectURL(asset.blob) : null), [asset]);
  const queuedItem = useMemo(
    () => (captureId ? uploadQueue.items.find((i) => i.captureId === captureId) ?? null : null),
    [captureId, uploadQueue.items]
  );
  const nextUnlockLine = me ? formatNextUnlockLine(me) : null;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const controller = new AbortController();
    getMe({ signal: controller.signal })
      .then((res) => setMe(res))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setMe(null);
      });
    return () => controller.abort();
  }, []);

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
    setAttributionArtistName("");
    setAttributionArtworkTitle("");
    setAttributionSource("");
    setAttributionSourceUrl("");
    setRightsBasis("");
    setRightsAttestation(false);
    setPublishRequested(false);
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
      const normalizedArtist = attributionArtistName.trim() || undefined;
      const normalizedTitle = attributionArtworkTitle.trim() || undefined;
      const normalizedSource = attributionSource.trim() || undefined;
      const normalizedSourceUrl = attributionSourceUrl.trim() || undefined;
      const normalizedRightsBasis = rightsBasis || undefined;
      const created = await createCapture({
        node_id: nodeId,
        checkin_token: checkinToken,
        attribution_artist_name: normalizedArtist,
        attribution_artwork_title: normalizedTitle,
        attribution_source: normalizedSource,
        attribution_source_url: normalizedSourceUrl,
        rights_basis: normalizedRightsBasis,
        rights_attestation: rightsAttestation || undefined,
        publish_requested: publishRequested || undefined
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
        if (err.code === "rank_locked") {
          const details = err.details ?? {};
          const currentRank = getNumberDetail(details, "current_rank");
          const requiredRank =
            getNumberDetail(details, "required_rank") ?? getNumberDetail(details, "node_min_rank");
          const detailParts: string[] = [];
          if (currentRank !== undefined) detailParts.push(`Current rank: ${currentRank}.`);
          if (requiredRank !== undefined) detailParts.push(`This node requires ${requiredRank}.`);
          setFailure({
            title: "Why can't I post?",
            detail: detailParts.length ? detailParts.join(" ") : err.message,
            nextStep:
              currentRank !== undefined && requiredRank !== undefined
                ? formatUnlockRequirement(currentRank, requiredRank)
                : nextUnlockLine ?? "Verify more captures to unlock access."
          });
          return;
        }
        if (err.code === "capture_rate_limited") {
          const details = err.details ?? {};
          const currentRank = getNumberDetail(details, "current_rank");
          const maxPerWindow = getNumberDetail(details, "max_per_window");
          const windowSeconds = getNumberDetail(details, "window_seconds");
          const detailParts: string[] = [];
          if (currentRank !== undefined) detailParts.push(`Current rank: ${currentRank}.`);
          if (maxPerWindow !== undefined && windowSeconds !== undefined) {
            detailParts.push(`Limit: ${maxPerWindow} captures per ${formatWindow(windowSeconds)} at this node.`);
          }
          setFailure({
            title: "Why can't I post?",
            detail: detailParts.length ? detailParts.join(" ") : err.message,
            nextStep: nextUnlockLine ?? "Verify more captures to unlock higher limits."
          });
          return;
        }
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
    <motion.div
      initial="initial"
      animate="animate"
      variants={staggerContainer}
      className="capture-flow"
    >
      {draftWarning ? (
        <motion.div variants={staggerItem} className="mb-6">
          <Alert variant="warning" title="Local fallback unavailable">
            <p className="text-sm mb-2">{draftWarning}</p>
            <p className="text-sm">Keep this tab open until the capture is created.</p>
          </Alert>
        </motion.div>
      ) : null}

      <AnimatePresence mode="wait">
        {status === "capturing" ? (
          <motion.div
            key="capturing"
            variants={staggerItem}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Card variant="light" padding="lg">
              <div className="mb-6">
                <h2 className="text-xl font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-2">
                  Ready to Capture
                </h2>
                <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                  Use your camera to capture the node.
                </p>
              </div>
              {!checkinToken && !captureId ? (
                <Alert variant="warning" title="Check-in required" className="mb-6">
                  <p className="text-sm">Return to the map to check in before capturing.</p>
                </Alert>
              ) : null}
              <div className="flex gap-4 flex-wrap">
                <Button
                  variant="copper"
                  size="lg"
                  onClick={handleTriggerCamera}
                  disabled={!checkinToken && !captureId}
                  className="flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Take Photo
                </Button>
                {onCancel ? (
                  <Button variant="light" size="lg" onClick={handleCancelAction}>
                    Cancel
                  </Button>
                ) : null}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </Card>
          </motion.div>
        ) : null}

        {status === "preview" && asset ? (
          <motion.div
            key="preview"
            variants={staggerItem}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-6"
          >
            <Card variant="light" padding="lg">
              <h2 className="text-xl font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-4">
                Review Your Photo
              </h2>
              {previewUrl ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={defaultTransition}
                  className="mb-4"
                >
                  <img
                    src={previewUrl}
                    alt="Capture preview"
                    className="w-full rounded-lg shadow-organic-light dark:shadow-organic-dark"
                  />
                </motion.div>
              ) : null}
              {asset.size ? (
                <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide mb-6">
                  {Math.round(asset.size / 1024)} KB
                </p>
              ) : null}
            </Card>

            <Card variant="light" padding="lg">
              <h3 className="text-lg font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-4">
                Attribution
                <span className="text-xs text-grounded-charcoal/60 dark:text-grounded-parchment/60 ml-2">
                  (required for publish)
                </span>
              </h3>
              <div className="space-y-4">
                <Input
                  label="Artist Name"
                  type="text"
                  value={attributionArtistName}
                  onChange={(event) => setAttributionArtistName(event.target.value)}
                  placeholder="Artist name"
                />
                <Input
                  label="Artwork Title"
                  type="text"
                  value={attributionArtworkTitle}
                  onChange={(event) => setAttributionArtworkTitle(event.target.value)}
                  placeholder="Artwork title"
                />
                <Input
                  label="Attribution Source"
                  type="text"
                  value={attributionSource}
                  onChange={(event) => setAttributionSource(event.target.value)}
                  placeholder="On-site signage, artist website, gallery placard"
                />
                <Input
                  label="Source URL (optional)"
                  type="url"
                  value={attributionSourceUrl}
                  onChange={(event) => setAttributionSourceUrl(event.target.value)}
                  placeholder="https://"
                />
              </div>
            </Card>

            <Card variant="light" padding="lg">
              <h3 className="text-lg font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-4">
                Rights & Consent
                <span className="text-xs text-grounded-charcoal/60 dark:text-grounded-parchment/60 ml-2">
                  (required for publish)
                </span>
              </h3>
              <div className="space-y-4">
                <Select
                  label="Rights Basis"
                  value={rightsBasis}
                  onChange={(event) => setRightsBasis(event.target.value as CaptureRightsBasis | "")}
                  options={[
                    { value: "", label: "Select a basis" },
                    { value: "i_took_photo", label: "I took the photo" },
                    { value: "permission_granted", label: "Permission granted" },
                    { value: "public_domain", label: "Public domain" },
                  ]}
                />
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rightsAttestation}
                    onChange={(event) => setRightsAttestation(event.target.checked)}
                    className="w-5 h-5 rounded border-grounded-charcoal/20 dark:border-grounded-parchment/20 text-grounded-copper focus:ring-grounded-copper focus:ring-2"
                  />
                  <span className="text-sm text-grounded-charcoal dark:text-grounded-parchment group-hover:text-grounded-copper transition-colors">
                    I attest I have the rights to share this capture publicly.
                  </span>
                </label>
              </div>
            </Card>

            <Card variant="light" padding="lg">
              <h3 className="text-lg font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-4">
                Publish Request
              </h3>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={publishRequested}
                  onChange={(event) => setPublishRequested(event.target.checked)}
                  className="w-5 h-5 rounded border-grounded-charcoal/20 dark:border-grounded-parchment/20 text-grounded-copper focus:ring-grounded-copper focus:ring-2"
                />
                <span className="text-sm text-grounded-charcoal dark:text-grounded-parchment group-hover:text-grounded-copper transition-colors">
                  Publish automatically once verified (requires attribution + rights).
                </span>
              </label>
            </Card>

            <div className="flex gap-4 flex-wrap">
              <Button
                variant="copper"
                size="lg"
                onClick={handleUploadFromPreview}
                disabled={(!checkinToken && !captureId) || submitLock.current}
                isLoading={submitLock.current}
                className="flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Submit
              </Button>
              <Button variant="light" size="lg" onClick={handleRetake}>
                Retake
              </Button>
              {onCancel ? (
                <Button variant="light" size="lg" onClick={handleCancelAction}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </motion.div>
        ) : null}

        {status === "processing" ? (
          <motion.div
            key="processing"
            variants={staggerItem}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Card variant="light" padding="lg">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 border-[3px] border-grounded-copper border-t-transparent rounded-full animate-spin" />
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-1">
                    Processing Your Photo
                  </h3>
                  <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                    We resize and strip metadata before upload.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : null}

        {status === "submitting" ? (
          <motion.div
            key="submitting"
            variants={staggerItem}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Card variant="light" padding="lg">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 border-[3px] border-grounded-copper border-t-transparent rounded-full animate-spin" />
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-1">
                    Creating Capture Record
                  </h3>
                  <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                    Keep this tab open while we submit.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ) : null}

        {status === "uploading" ? (
          <motion.div
            key="uploading"
            variants={staggerItem}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Card variant="light" padding="lg">
              <div className="mb-4">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-8 h-8 border-3 border-grounded-copper border-t-transparent rounded-full animate-spin" />
                  <h3 className="text-lg font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment">
                    {queuedItem?.status === "pending"
                      ? "Queued for Upload"
                      : queuedItem?.status === "uploading"
                        ? "Uploading Your Photo"
                        : "Preparing Upload"}
                  </h3>
                </div>
                {queuedItem?.progress?.total ? (
                  <div className="mb-3">
                    <div className="w-full bg-grounded-charcoal/10 dark:bg-grounded-parchment/10 rounded-full h-2 mb-2">
                      <motion.div
                        className="bg-grounded-copper h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(100, Math.round((queuedItem.progress.loaded / queuedItem.progress.total) * 100))}%`,
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                      {Math.min(100, Math.round((queuedItem.progress.loaded / queuedItem.progress.total) * 100))}% uploaded
                    </p>
                  </div>
                ) : queuedItem?.status === "pending" && queuedItem.nextAttemptAt ? (
                  <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide mb-2">
                    Next retry: {new Date(queuedItem.nextAttemptAt).toLocaleTimeString()}
                  </p>
                ) : (
                  <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide mb-2">
                    Uploads can take longer on weak networks.
                  </p>
                )}
                {!navigator.onLine ? (
                  <Alert variant="warning" className="mt-3">
                    <p className="text-sm">Offline — upload will resume when you reconnect.</p>
                  </Alert>
                ) : null}
              </div>
            </Card>
          </motion.div>
        ) : null}

        {status === "success" ? (
          <motion.div
            key="success"
            variants={staggerItem}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Alert variant="success" title="Upload Complete">
              <div className="mb-4">
                <p className="text-sm">
                  Capture {captureId ? `${captureId.slice(0, 8)}…` : "ready"} is pending review.
                </p>
              </div>
              <div className="flex gap-4 flex-wrap">
                {onDone ? (
                  <Button variant="copper" size="md" onClick={() => onDone(captureId ?? "")} disabled={!captureId}>
                    Done
                  </Button>
                ) : null}
                {onCancel ? (
                  <Button variant="light" size="md" onClick={handleCancelAction}>
                    Back to Map
                  </Button>
                ) : null}
              </div>
            </Alert>
          </motion.div>
        ) : null}

        {status === "failure" && failure ? (
          <motion.div
            key="failure"
            variants={staggerItem}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Alert variant="error" title={failure.title}>
              <div className="mb-4 space-y-2">
                {failure.detail ? <p className="text-sm">{failure.detail}</p> : null}
                {failure.nextStep ? (
                  <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">
                    {failure.nextStep}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-4 flex-wrap">
                <Button
                  variant="copper"
                  size="md"
                  onClick={handleRetry}
                  disabled={!checkinToken && !captureId}
                >
                  Retry
                </Button>
                <Button variant="light" size="md" onClick={handleRetake}>
                  Retake
                </Button>
                {onCancel ? (
                  <Button variant="light" size="md" onClick={handleCancelAction}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </Alert>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
