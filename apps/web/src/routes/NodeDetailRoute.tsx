import { Link, useLocation, useParams } from "react-router-dom";
import type { NodePublic } from "../features/nodes/types";

type NodeLocationState = {
  node?: NodePublic;
} | null;

export function NodeDetailRoute() {
  const { nodeId } = useParams();
  const location = useLocation();
  const node = (location.state as NodeLocationState)?.node ?? null;

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
            <div className="section">
              <h2>Verified captures</h2>
              <div className="empty-state">No verified captures yet.</div>
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
