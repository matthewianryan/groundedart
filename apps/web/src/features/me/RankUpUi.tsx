import React, { useEffect, useMemo, useRef, useState } from "react";

export type RankUpUnlocked = {
  summary: string;
  unlocks: string[];
};

export type RankUpEvent = {
  id: string;
  fromRank: number;
  toRank: number;
  unlocked: RankUpUnlocked | null;
};

export type ToastNotice = {
  id: string;
  title: string;
  lines: string[];
};

function useAnimatedNumber(target: number, durationMs = 650) {
  const [value, setValue] = useState(target);
  const rafRef = useRef<number | null>(null);
  const lastTargetRef = useRef(target);

  useEffect(() => {
    if (lastTargetRef.current === target) return;
    if (typeof requestAnimationFrame !== "function") {
      lastTargetRef.current = target;
      setValue(target);
      return;
    }
    const from = value;
    const to = target;
    const start = performance.now();
    lastTargetRef.current = target;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (to - from) * eased);
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // Intentionally omit `value` so animation runs once per target change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}

export function RankBadge({ rank, pulseKey }: { rank: number; pulseKey: number }) {
  const animatedRank = useAnimatedNumber(rank);
  return (
    <div className="ga-rank-badge" key={pulseKey}>
      <div className="muted">Current rank</div>
      <div className="ga-rank-number" aria-label={`Current rank ${rank}`}>
        {animatedRank}
      </div>
    </div>
  );
}

export function RankUpOverlay({
  event,
  onDismiss
}: {
  event: RankUpEvent | null;
  onDismiss: () => void;
}) {
  const unlockLines = useMemo(() => {
    if (!event?.unlocked) return [];
    const lines = [event.unlocked.summary].filter(Boolean);
    if (event.unlocked.unlocks.length) lines.push(...event.unlocked.unlocks);
    return lines;
  }, [event]);

  if (!event) return null;

  return (
    <div className="ga-rankup-overlay" role="dialog" aria-label="Rank up celebration">
      <div className="ga-rankup-backdrop" onClick={onDismiss} />
      <div className="ga-rankup-card">
        <div className="ga-rankup-confetti" aria-hidden="true" />
        <div className="ga-rankup-header">
          <div>
            <div className="ga-rankup-title">Rank up</div>
            <div className="ga-rankup-subtitle">
              {event.fromRank} → {event.toRank}
            </div>
          </div>
          <button type="button" onClick={onDismiss} className="ga-rankup-close">
            Close
          </button>
        </div>
        {unlockLines.length ? (
          <div className="ga-rankup-unlocks">
            {unlockLines.map((line) => (
              <div key={line} className="ga-rankup-unlock ga-ripple">
                {line}
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            Keep exploring to unlock more.
          </div>
        )}
      </div>
    </div>
  );
}

export function ToastStack({
  toasts,
  onDismiss
}: {
  toasts: ToastNotice[];
  onDismiss: (toastId: string) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="ga-toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="ga-toast ga-pop">
          <div className="ga-toast-head">
            <strong>{toast.title}</strong>
            <button type="button" className="ga-toast-close" onClick={() => onDismiss(toast.id)}>
              ×
            </button>
          </div>
          <div className="ga-toast-body">
            {toast.lines.map((line) => (
              <div key={line} className="ga-toast-line ga-ripple">
                {line}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
