import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { isApiError } from "../api/http";
import { CaptureFlow } from "../features/captures/CaptureFlow";
import { getCapture } from "../features/captures/api";
import { loadActiveCaptureDraft } from "../features/captures/captureDraftStore";
import type { CaptureAsset, CaptureIntent } from "../features/captures/captureFlowState";
import { getNode } from "../features/nodes/api";
import type { NodePublic } from "../features/nodes/types";

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
      <div className="panel detail">
        <h1>Capture</h1>
        <div className="muted">Node: {nodeLabel}</div>
        {blockingError ? (
          <div className="alert" style={{ marginTop: 12 }}>
            <div>Unable to load capture</div>
            <div className="muted">{loadError}</div>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => navigate("/map")}>Back to map</button>
            </div>
          </div>
        ) : nodeId ? (
          <CaptureFlow
            nodeId={nodeId}
            nodeName={nodeName ?? undefined}
            checkinToken={checkinToken}
            captureId={captureId ?? null}
            initialAsset={initialAsset}
            initialIntent={initialIntent}
            onCaptureCreated={(id) => navigate(`/capture/${id}`, { replace: true })}
            onDone={() => navigate("/map")}
            onCancel={() => navigate("/map")}
          />
        ) : isLoading ? (
          <div className="muted" style={{ marginTop: 12 }}>
            Loading capture…
          </div>
        ) : showMissingContext ? (
          <div className="alert" style={{ marginTop: 12 }}>
            <div>Missing node context</div>
            <div className="muted">Return to the map and start capture again.</div>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => navigate("/map")}>Back to map</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
