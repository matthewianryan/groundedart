import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Register from "./pages/Register";
import { MapRoute } from "./routes/MapRoute";
import { NodeDetailRoute } from "./routes/NodeDetailRoute";
import { CaptureRoute } from "./routes/CaptureRoute";

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Register />} />
        <Route path="/map" element={<MapRoute />} />
        <Route path="/capture/:captureId?" element={<CaptureRoute />} />
        <Route path="/nodes/:nodeId" element={<NodeDetailRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
