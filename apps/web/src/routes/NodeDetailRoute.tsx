import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { isApiError } from "../api/http";
import { listNodeCaptures, type CapturePublic } from "../features/captures/api";
import { getMe } from "../features/me/api";
import type { MeResponse } from "../features/me/types";
import type { NodePublic } from "../features/nodes/types";

type NodeLocationState = {
  node?: NodePublic;
} | null;

export function NodeDetailRoute() {
  const { nodeId } = useParams();
  const location = useLocation();
  const node = (location.state as NodeLocationState)?.node ?? null;
  const [captures, setCaptures] = useState<CapturePublic[]>([]);
  const [capturesStatus, setCapturesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [capturesError, setCapturesError] = useState<string | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);

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
      return;
    }

    const controller = new AbortController();
    setCapturesStatus("loading");
    setCapturesError(null);

    listNodeCaptures(nodeId, { signal: controller.signal })
      .then((res) => {
        setCaptures(res.captures);
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
  }, [nodeId]);

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

  return (
    <div className="detail-layout">
      <div className="panel detail">
        <h1>Node detail</h1>
        <div className="muted">Node ID: {nodeId ?? "unknown"}</div>
        {node ? (
          <div className="node">
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
              <div style={{ marginTop: 8 }}>You are rank {me.rank}; this node requires {node.min_rank}.</div>
            ) : null}
            <div className="section">
              <h2>Verified captures</h2>
              {capturesStatus === "loading" ? (
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
                      <div key={capture.id} className="capture-thumb">
                        {capture.image_url ? (
                          <img src={capture.image_url} alt="Verified capture" loading="lazy" />
                        ) : (
                          <div className="capture-thumb-fallback">Image pending</div>
                        )}
                        {attribution ? (
                          <div className="muted" style={{ marginTop: 6 }}>
                            {attribution}
                            {capture.attribution_source ? ` · ${capture.attribution_source}` : ""}
                          </div>
                        ) : null}
                        {capture.attribution_source_url ? (
                          <div className="muted" style={{ marginTop: 4 }}>
                            <a href={capture.attribution_source_url} target="_blank" rel="noreferrer">
                              Source
                            </a>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="node">
            <div className="muted">Open a node from the map to see details.</div>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Link to="/map">Back to map</Link>
        </div>
      </div>
    </div>
  );
}
