import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { isApiError } from "../api/http";
import { CaptureFlow } from "../features/captures/CaptureFlow";
import { getCapture } from "../features/captures/api";
import { loadActiveCaptureDraft } from "../features/captures/captureDraftStore";
import type { CaptureAsset, CaptureIntent } from "../features/captures/captureFlowState";
import { getNode } from "../features/nodes/api";
import type { NodePublic } from "../features/nodes/types";
import { Button, Card, Alert } from "../components/ui";
import { fadeInUp, defaultTransition } from "../utils/animations";

type CaptureRouteState = {
  node?: NodePublic;
  checkinToken?: string;
} | null;

export function CaptureRoute() {
  const { captureId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as CaptureRouteState;
  const [nodeId, setNodeId] = useState<string | null>(state?.node?.id ?? null);
  const [nodeName, setNodeName] = useState<string | null>(state?.node?.name ?? null);
  const [checkinToken, setCheckinToken] = useState<string | null>(state?.checkinToken ?? null);
  const [initialAsset, setInitialAsset] = useState<CaptureAsset | null>(null);
  const [initialIntent, setInitialIntent] = useState<CaptureIntent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!captureId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const capture = await getCapture(captureId);
        if (cancelled) return;
        setNodeId(capture.node_id);
        try {
          const res = await getNode(capture.node_id);
          if (cancelled) return;
          if (res.node.visibility === "visible") {
            setNodeName(res.node.name);
          } else {
            setNodeName("Locked node");
          }
        } catch {
          // Leave node name as-is if we cannot fetch details.
        }
      } catch (err) {
        if (cancelled) return;
        const message = isApiError(err) ? err.message : err instanceof Error ? err.message : String(err);
        setLoadError(message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [captureId]);

  useEffect(() => {
    if (captureId || nodeId) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const draft = await loadActiveCaptureDraft();
        if (!draft || cancelled) return;
        setNodeId(draft.nodeId);
        setNodeName(draft.nodeName ?? null);
        setCheckinToken(draft.checkinToken);
        const file = new File([draft.blob], draft.fileName, { type: draft.mimeType });
        setInitialAsset({
          blob: draft.blob,
          file,
          fileName: draft.fileName,
          contentType: draft.mimeType,
          size: draft.size
        });
        setInitialIntent({
          nodeId: draft.nodeId,
          checkinToken: draft.checkinToken,
          capturedAt: draft.capturedAt
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setLoadError(message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [captureId, nodeId]);

  const nodeLabel = nodeName ?? nodeId ?? "unknown";
  const blockingError = loadError && !nodeId;
  const showMissingContext = !nodeId && !isLoading && !blockingError;

  return (
    <div className="detail-layout">
      <motion.div
        initial="initial"
        animate="animate"
        variants={fadeInUp}
        transition={defaultTransition}
        className="panel detail"
      >
        <Card variant="light" padding="lg" className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-tight text-grounded-charcoal dark:text-grounded-parchment mb-2">
                Capture
              </h1>
              <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                Node: {nodeLabel}
              </div>
            </div>
            <Button
              variant="light"
              size="sm"
              onClick={() => navigate(`/map${location.search}`)}
              className="flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </Button>
          </div>
        </Card>

        {blockingError ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={defaultTransition}
          >
            <Alert variant="error" title="Unable to load capture">
              <div className="mb-4">
                <p className="text-sm">{loadError}</p>
              </div>
              <Button variant="copper" size="sm" onClick={() => navigate(`/map${location.search}`)}>
                Back to map
              </Button>
            </Alert>
          </motion.div>
        ) : nodeId ? (
          <CaptureFlow
            nodeId={nodeId}
            nodeName={nodeName ?? undefined}
            checkinToken={checkinToken}
            captureId={captureId ?? null}
            initialAsset={initialAsset}
            initialIntent={initialIntent}
            onCaptureCreated={(id) => navigate(`/capture/${id}${location.search}`, { replace: true })}
            onDone={() => navigate(`/map${location.search}`)}
            onCancel={() => navigate(`/map${location.search}`)}
          />
        ) : isLoading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={defaultTransition}
          >
            <Card variant="light" padding="md">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-grounded-copper border-t-transparent rounded-full animate-spin" />
                <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                  Loading capture…
                </div>
              </div>
            </Card>
          </motion.div>
        ) : showMissingContext ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={defaultTransition}
          >
            <Alert variant="warning" title="Missing node context">
              <div className="mb-4">
                <p className="text-sm">Return to the map and start capture again.</p>
              </div>
              <Button variant="copper" size="sm" onClick={() => navigate(`/map${location.search}`)}>
                Back to map
              </Button>
            </Alert>
          </motion.div>
        ) : null}
      </motion.div>
    </div>
  );
}
