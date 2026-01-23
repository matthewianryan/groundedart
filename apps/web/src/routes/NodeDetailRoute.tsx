import { useEffect, useState } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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
import { Button, Card, Badge, Alert, Select } from "../components/ui";
import { fadeInUp, staggerContainer, staggerItem, scaleIn, defaultTransition } from "../utils/animations";

type NodeLocationState = {
  node?: NodePublic;
} | null;

export function NodeDetailRoute() {
  const { nodeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
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
      <motion.div
        initial="initial"
        animate="animate"
        variants={fadeInUp}
        transition={defaultTransition}
        className="panel detail"
      >
        {/* Header */}
        <Card variant="light" padding="lg" className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-tight text-grounded-charcoal dark:text-grounded-parchment mb-2">
                Node Detail
              </h1>
              <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                Node ID: {nodeId ?? "unknown"}
              </div>
            </div>
            <Button
              variant="light"
              size="sm"
              onClick={() => navigate("/map")}
              className="flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </Button>
          </div>
        </Card>

        {node ? (
          <motion.div
            initial="initial"
            animate="animate"
            variants={staggerContainer}
            className="space-y-6"
          >
            {node.visibility === "locked" ? (
              <motion.div variants={staggerItem}>
                <Alert variant="warning" title="Locked Node">
                  <div className="mb-4">
                    <p className="text-sm mb-2">Unlock at rank {node.required_rank}</p>
                    <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">
                      Your rank: {me?.rank ?? node.current_rank}. Required: {node.required_rank}.
                    </p>
                  </div>
                </Alert>
              </motion.div>
            ) : (
              <>
                {/* Node Information Card */}
                <motion.div variants={staggerItem}>
                  <Card variant="light" padding="lg">
                    <div className="mb-4">
                      <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight text-grounded-charcoal dark:text-grounded-parchment mb-2">
                        {node.name}
                      </h2>
                      <Badge variant="default" size="sm">
                        {node.category}
                      </Badge>
                    </div>
                    {node.description ? (
                      <p className="text-base text-grounded-charcoal dark:text-grounded-parchment mb-6 leading-relaxed">
                        {node.description}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-grounded-charcoal/60 dark:text-grounded-parchment/60 mb-1">
                          Latitude
                        </div>
                        <div className="text-sm font-medium text-grounded-charcoal dark:text-grounded-parchment">
                          {node.lat.toFixed(5)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-grounded-charcoal/60 dark:text-grounded-parchment/60 mb-1">
                          Longitude
                        </div>
                        <div className="text-sm font-medium text-grounded-charcoal dark:text-grounded-parchment">
                          {node.lng.toFixed(5)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-grounded-charcoal/60 dark:text-grounded-parchment/60 mb-1">
                          Radius
                        </div>
                        <div className="text-sm font-medium text-grounded-charcoal dark:text-grounded-parchment">
                          {node.radius_m} m
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-grounded-charcoal/60 dark:text-grounded-parchment/60 mb-1">
                          Min Rank
                        </div>
                        <div className="text-sm font-medium text-grounded-charcoal dark:text-grounded-parchment">
                          {node.min_rank}
                        </div>
                      </div>
                    </div>
                    {me ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">
                          You are rank
                        </span>
                        <Badge variant={me.rank >= node.min_rank ? "success" : "default"} size="sm">
                          {me.rank}
                        </Badge>
                        <span className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70">
                          this node requires
                        </span>
                        <Badge variant="default" size="sm">
                          {node.min_rank}
                        </Badge>
                      </div>
                    ) : null}
                  </Card>
                </motion.div>

                {/* Tip Flow */}
                {tipsEnabled ? (
                  <motion.div variants={staggerItem}>
                    <Card variant="light" padding="lg">
                      <h2 className="text-xl font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-4">
                        Tip the Artist
                      </h2>
                      <TipFlow nodeId={node.id} nodeName={node.name} />
                    </Card>
                  </motion.div>
                ) : null}
              </>
            )}
            {/* Verified Captures Section */}
            <motion.div variants={staggerItem}>
              <Card variant="light" padding="lg">
                <h2 className="text-xl font-bold uppercase tracking-wide text-grounded-charcoal dark:text-grounded-parchment mb-6">
                  Verified Captures
                </h2>
                {node.visibility === "locked" ? (
                  <Card variant="light" padding="md" className="border-2 border-dashed border-grounded-charcoal/20 dark:border-grounded-parchment/20">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <svg className="w-12 h-12 text-grounded-charcoal/40 dark:text-grounded-parchment/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                        Unlock this node to view verified captures.
                      </p>
                    </div>
                  </Card>
                ) : capturesStatus === "loading" ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Card key={i} variant="light" padding="none" className="animate-pulse">
                        <div className="aspect-square bg-grounded-charcoal/10 dark:bg-grounded-parchment/10 rounded-lg" />
                      </Card>
                    ))}
                  </div>
                ) : capturesStatus === "error" ? (
                  <Alert variant="error" title="Unable to Load Captures">
                    <p className="text-sm">{capturesError ?? "Unable to load verified captures."}</p>
                  </Alert>
                ) : captures.length === 0 ? (
                  <Card variant="light" padding="md" className="border-2 border-dashed border-grounded-charcoal/20 dark:border-grounded-parchment/20">
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <svg className="w-12 h-12 text-grounded-charcoal/40 dark:text-grounded-parchment/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                        No verified captures yet.
                      </p>
                    </div>
                  </Card>
                ) : (
                  <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                  >
                    {captures.map((capture, index) => {
                      const attribution = formatAttribution(capture);
                      return (
                        <motion.div
                          key={capture.id}
                          variants={staggerItem}
                          transition={{ ...defaultTransition, delay: index * 0.05 }}
                        >
                          <Card variant="light" padding="none" hover={true} className="overflow-hidden">
                            <div className="relative aspect-square overflow-hidden bg-grounded-charcoal/5 dark:bg-grounded-parchment/5">
                              {capture.image_url ? (
                                <motion.img
                                  src={capture.image_url}
                                  alt="Verified capture"
                                  loading="lazy"
                                  initial={{ opacity: 0, scale: 1.1 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={defaultTransition}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full">
                                  <div className="text-xs text-grounded-charcoal/50 dark:text-grounded-parchment/50 uppercase tracking-wide text-center px-4">
                                    Image pending
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="p-3 space-y-2">
                              {attribution ? (
                                <div className="text-xs text-grounded-charcoal/80 dark:text-grounded-parchment/80 leading-relaxed">
                                  {attribution}
                                  {capture.attribution_source ? (
                                    <span className="text-grounded-charcoal/60 dark:text-grounded-parchment/60">
                                      {" "}· {capture.attribution_source}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                              {capture.attribution_source_url ? (
                                <a
                                  href={capture.attribution_source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-grounded-copper hover:text-grounded-clay dark:text-grounded-copper dark:hover:text-grounded-clay transition-colors uppercase tracking-wide"
                                >
                                  Source →
                                </a>
                              ) : null}
                              {me ? (
                                <div className="flex items-center gap-2 pt-2">
                                  {lastReportedId === capture.id ? (
                                    <Badge variant="success" size="sm">Reported</Badge>
                                  ) : (
                                    <Button
                                      variant="light"
                                      size="sm"
                                      onClick={() => startReport(capture.id)}
                                      disabled={reportingCaptureId === capture.id && reportStatus === "submitting"}
                                      className="flex items-center gap-1 text-xs"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                      </svg>
                                      Report
                                    </Button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                            {/* Report Form */}
                            <AnimatePresence>
                              {reportingCaptureId === capture.id ? (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={defaultTransition}
                                  className="border-t border-grounded-charcoal/10 dark:border-grounded-parchment/10"
                                >
                                  <Card variant="light" padding="md" className="rounded-none border-0">
                                    <Select
                                      label="Reason"
                                      value={reportReason}
                                      onChange={(event) => setReportReason(event.target.value as ReportReasonCode)}
                                      options={reportReasons.map((reason) => ({
                                        value: reason,
                                        label: reason.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                                      }))}
                                      className="mb-4"
                                    />
                                    <label className="block text-xs uppercase tracking-wide mb-2 text-grounded-charcoal/70 dark:text-grounded-parchment/70">
                                      Details (optional)
                                    </label>
                                    <textarea
                                      id={`report-details-${capture.id}`}
                                      rows={3}
                                      value={reportDetails}
                                      onChange={(event) => setReportDetails(event.target.value)}
                                      className="w-full px-4 py-3 rounded-lg border border-grounded-charcoal/20 dark:border-grounded-parchment/20 bg-white dark:bg-grounded-charcoal/50 text-grounded-charcoal dark:text-grounded-parchment transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-grounded-copper focus:ring-offset-2 resize-none"
                                      placeholder="Provide additional details..."
                                    />
                                    {reportStatus === "error" ? (
                                      <Alert variant="error" className="mt-4">
                                        <p className="text-sm">{reportError ?? "Unable to submit report."}</p>
                                      </Alert>
                                    ) : null}
                                    <div className="flex gap-3 mt-4">
                                      <Button
                                        variant="copper"
                                        size="sm"
                                        onClick={() => submitReport(capture.id)}
                                        disabled={reportStatus === "submitting"}
                                        isLoading={reportStatus === "submitting"}
                                      >
                                        Submit
                                      </Button>
                                      <Button
                                        variant="light"
                                        size="sm"
                                        onClick={() => setReportingCaptureId(null)}
                                        disabled={reportStatus === "submitting"}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </Card>
                                </motion.div>
                              ) : null}
                            </AnimatePresence>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </Card>
            </motion.div>
          </motion.div>
        ) : nodeId ? (
          <motion.div
            initial="initial"
            animate="animate"
            variants={fadeInUp}
            transition={defaultTransition}
          >
            {capturesStatus === "loading" ? (
              <Card variant="light" padding="lg">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 border-[3px] border-grounded-copper border-t-transparent rounded-full animate-spin" />
                  <div className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                    Loading node…
                  </div>
                </div>
              </Card>
            ) : capturesStatus === "error" ? (
              <Alert variant="error" title="Unable to Load Node">
                <p className="text-sm">{capturesError ?? "Unable to load node."}</p>
              </Alert>
            ) : (
              <Card variant="light" padding="lg">
                <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                  No node data available.
                </p>
              </Card>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial="initial"
            animate="animate"
            variants={fadeInUp}
            transition={defaultTransition}
          >
            <Card variant="light" padding="lg">
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <svg className="w-12 h-12 text-grounded-charcoal/40 dark:text-grounded-parchment/40 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <p className="text-sm text-grounded-charcoal/70 dark:text-grounded-parchment/70 uppercase tracking-wide">
                  Open a node from the map to see details.
                </p>
              </div>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
