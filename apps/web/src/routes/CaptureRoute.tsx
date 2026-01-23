import { useLocation, useNavigate } from "react-router-dom";
import { CaptureFlow } from "../features/captures/CaptureFlow";
import type { NodePublic } from "../features/nodes/types";

type CaptureRouteState = {
  node?: NodePublic;
  checkinToken?: string;
} | null;

export function CaptureRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as CaptureRouteState;
  const node = state?.node ?? null;
  const checkinToken = state?.checkinToken ?? null;

  return (
    <div className="detail-layout">
      <div className="panel detail">
        <h1>Capture</h1>
        {node ? <div className="muted">Node: {node.name}</div> : <div className="muted">Node: unknown</div>}
        {node ? (
          <CaptureFlow
            nodeId={node.id}
            nodeName={node.name}
            checkinToken={checkinToken}
            onDone={() => navigate("/map")}
            onCancel={() => navigate("/map")}
          />
        ) : (
          <div className="alert" style={{ marginTop: 12 }}>
            <div>Missing node context</div>
            <div className="muted">Return to the map and start capture again.</div>
            <div style={{ marginTop: 8 }}>
              <button onClick={() => navigate("/map")}>Back to map</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
