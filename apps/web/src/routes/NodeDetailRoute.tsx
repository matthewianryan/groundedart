import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { isApiError } from "../api/http";
import {
  createCaptureReport,
  listNodeCaptures,
  type CapturePublic,
  type NodeCapturesResponse,
  type ReportReasonCode
} from "../features/captures/api";
import { getMe } from "../features/me/api";
import type { MeResponse } from "../features/me/types";
import type { NodePublic, NodeView } from "../features/nodes/types";
import { TipFlow } from "../features/tips/TipFlow";

type NodeLocationState = {
  node?: NodePublic;
} | null;

export function NodeDetailRoute() {
  const { nodeId } = useParams();
  const location = useLocation();
  const seedNode = (location.state as NodeLocationState)?.node ?? null;
  const [node, setNode] = useState<NodeView | null>(seedNode);
  const [captures, setCaptures] = useState<CapturePublic[]>([]);
  const [capturesStatus, setCapturesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [capturesError, setCapturesError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [reportingCaptureId, setReportingCaptureId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState<ReportReasonCode>("other");
  const [reportDetails, setReportDetails] = useState<string>("");
  const [reportStatus, setReportStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [reportError, setReportError] = useState<string | null>(null);
  const [lastReportedId, setLastReportedId] = useState<string | null>(null);
  const tipsEnabled = import.meta.env.VITE_TIPS_ENABLED === "true";

  const reportReasons: ReportReasonCode[] = [
    "spam",
    "rights_violation",
    "privacy",
    "harassment",
    "other"
  ];

  function formatAttribution(capture: CapturePublic): string | null {
    const artist = capture.attribution_artist_name?.trim();
    const title = capture.attribution_artwork_title?.trim();
    if (artist && title) return `${artist} — ${title}`;
    if (artist) return artist;
    if (title) return title;
    return null;
  }

  useEffect(() => {
    if (!nodeId) {
      setCaptures([]);
      setCapturesStatus("idle");
      setCapturesError(null);
      setNode(seedNode);
      return;
    }

    const controller = new AbortController();
    setCapturesStatus("loading");
    setCapturesError(null);

    listNodeCaptures(nodeId, { signal: controller.signal })
      .then((res) => {
        const payload = res as NodeCapturesResponse;
        setNode(payload.node);
        setCaptures(payload.captures);
        setCapturesStatus("ready");
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setCapturesStatus("error");
        if (isApiError(err)) {
          setCapturesError(err.message || "Unable to load verified captures.");
        } else {
          setCapturesError("Unable to load verified captures.");
        }
      });

    return () => controller.abort();
  }, [nodeId, seedNode]);

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

  function startReport(captureId: string) {
    setReportingCaptureId(captureId);
    setReportReason("other");
    setReportDetails("");
    setReportStatus("idle");
    setReportError(null);
  }

  async function submitReport(captureId: string) {
    setReportStatus("submitting");
    setReportError(null);
    try {
      await createCaptureReport(captureId, {
        reason: reportReason,
        details: reportDetails.trim() ? reportDetails.trim() : null
      });
      setLastReportedId(captureId);
      setReportingCaptureId(null);
      setReportDetails("");
      setReportStatus("idle");
    } catch (err) {
      setReportStatus("error");
      if (isApiError(err)) {
        setReportError(err.message || "Unable to submit report.");
      } else {
        setReportError("Unable to submit report.");
      }
    }
  }

  return (
    <div className="detail-layout">
      <div className="panel detail">
        <h1>Node detail</h1>
        <div className="muted">Node ID: {nodeId ?? "unknown"}</div>
        {node ? (
          <div className="node">
            {node.visibility === "locked" ? (
              <>
                <div className="node-header">
                  <div>
                    <strong>Locked node</strong>
                  </div>
                  <div className="muted">Unlock at rank {node.required_rank}</div>
                </div>
                <div className="muted" style={{ marginTop: 8 }}>
                  Your rank: {me?.rank ?? node.current_rank}. Required: {node.required_rank}.
                </div>
              </>
            ) : (
              <>
                <div className="node-header">
                  <div>
                    <strong>{node.name}</strong>
                  </div>
                  <div className="muted">{node.category}</div>
                </div>
                {node.description ? <div className="node-description">{node.description}</div> : null}
                <dl className="metadata">
                  <div>
                    <dt>Latitude</dt>
                    <dd>{node.lat.toFixed(5)}</dd>
                  </div>
                  <div>
                    <dt>Longitude</dt>
                    <dd>{node.lng.toFixed(5)}</dd>
                  </div>
                  <div>
                    <dt>Radius</dt>
                    <dd>{node.radius_m} m</dd>
                  </div>
                  <div>
                    <dt>Min rank</dt>
                    <dd>{node.min_rank}</dd>
                  </div>
                </dl>
                {me ? (
                  <div style={{ marginTop: 8 }}>
                    You are rank {me.rank}; this node requires {node.min_rank}.
                  </div>
                ) : null}
                {tipsEnabled ? (
                  <div className="section">
                    <h2>Tip the artist</h2>
                    <TipFlow nodeId={node.id} nodeName={node.name} />
                  </div>
                ) : null}
              </>
            )}
            <div className="section">
              <h2>Verified captures</h2>
              {node.visibility === "locked" ? (
                <div className="empty-state">Unlock this node to view verified captures.</div>
              ) : capturesStatus === "loading" ? (
                <div className="empty-state">Loading verified captures...</div>
              ) : capturesStatus === "error" ? (
                <div className="alert">{capturesError ?? "Unable to load verified captures."}</div>
              ) : captures.length === 0 ? (
                <div className="empty-state">No verified captures yet.</div>
              ) : (
                <div className="captures-grid">
                  {captures.map((capture) => {
                    const attribution = formatAttribution(capture);
                    return (
                      <div key={capture.id} className="capture-card">
                        <div className="capture-thumb">
                          {capture.image_url ? (
                            <img src={capture.image_url} alt="Verified capture" loading="lazy" />
                          ) : (
                            <div className="capture-thumb-fallback">Image pending</div>
                          )}
                        </div>
                        {attribution ? (
                          <div className="muted">
                            {attribution}
                            {capture.attribution_source ? ` · ${capture.attribution_source}` : ""}
                          </div>
                        ) : null}
                        {capture.attribution_source_url ? (
                          <div className="muted">
                            <a href={capture.attribution_source_url} target="_blank" rel="noreferrer">
                              Source
                            </a>
                          </div>
                        ) : null}
                        {me ? (
                          <div className="report-actions">
                            <button
                              type="button"
                              onClick={() => startReport(capture.id)}
                              disabled={reportingCaptureId === capture.id && reportStatus === "submitting"}
                            >
                              Report
                            </button>
                            {lastReportedId === capture.id ? (
                              <span className="muted">Reported</span>
                            ) : null}
                          </div>
                        ) : null}
                        {reportingCaptureId === capture.id ? (
                          <div className="report-form">
                            <label className="muted" htmlFor={`report-reason-${capture.id}`}>
                              Reason
                            </label>
                            <select
                              id={`report-reason-${capture.id}`}
                              value={reportReason}
                              onChange={(event) => setReportReason(event.target.value as ReportReasonCode)}
                            >
                              {reportReasons.map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason.replace(/_/g, " ")}
                                </option>
                              ))}
                            </select>
                            <label className="muted" htmlFor={`report-details-${capture.id}`}>
                              Details (optional)
                            </label>
                            <textarea
                              id={`report-details-${capture.id}`}
                              rows={3}
                              value={reportDetails}
                              onChange={(event) => setReportDetails(event.target.value)}
                            />
                            <div className="report-actions">
                              <button
                                type="button"
                                onClick={() => submitReport(capture.id)}
                                disabled={reportStatus === "submitting"}
                              >
                                Submit
                              </button>
                              <button
                                type="button"
                                onClick={() => setReportingCaptureId(null)}
                                disabled={reportStatus === "submitting"}
                              >
                                Cancel
                              </button>
                            </div>
                            {reportStatus === "error" ? (
                              <div className="alert">{reportError ?? "Unable to submit report."}</div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : nodeId ? (
          <div className="node">
            {capturesStatus === "loading" ? (
              <div className="empty-state">Loading node…</div>
            ) : capturesStatus === "error" ? (
              <div className="alert">{capturesError ?? "Unable to load node."}</div>
            ) : (
              <div className="muted">No node data available.</div>
            )}
          </div>
        ) : (
          <div className="node">
            <div className="muted">Open a node from the map to see details.</div>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Link to={`/map${location.search}`}>Back to map</Link>
        </div>
      </div>
    </div>
  );
}
