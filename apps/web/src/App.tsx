import { Navigate, Route, Routes } from "react-router-dom";
import { MapRoute } from "./routes/MapRoute";
import { NodeDetailRoute } from "./routes/NodeDetailRoute";
import { CaptureRoute } from "./routes/CaptureRoute";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<MapRoute />} />
      <Route path="/map" element={<MapRoute />} />
      <Route path="/capture" element={<CaptureRoute />} />
      <Route path="/nodes/:nodeId" element={<NodeDetailRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
