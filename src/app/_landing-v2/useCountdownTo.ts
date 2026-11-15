"use client";

/**
 * A countdown to any instant, for the landing page's opening and first-turn
 * clocks. Presentation lives in the caller.
 *
 * Mount-gated for the same reason as the CRT countdown: the server cannot know
 * the viewer's clock, so it renders nothing until the first client tick.
 */
import { useEffect, useState } from "react";

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

/** Time left until `targetMs`, or null once it has arrived. */
export function remainingUntil(targetMs: number, nowMs: number): CountdownParts | null {
  const ms = targetMs - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
  };
}

function toMs(target: string | number | null | undefined): number | null {
  if (target === null || target === undefined) return null;
  const ms = typeof target === "number" ? target : Date.parse(target);
  return Number.isNaN(ms) ? null : ms;
}

/** Ticks once a second while the target is ahead; null before mount and after it passes. */
export function useCountdownTo(target: string | number | null | undefined): CountdownParts | null {
  const targetMs = toMs(target);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (targetMs === null) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= targetMs) clearInterval(timer);
    };
    tick();
    timer = setInterval(tick, 1000);
    // Hidden tabs stop ticking; every value derives from Date.now(), so resuming is exact.
    const onVisibility = () => {
      clearInterval(timer);
      if (document.visibilityState === "hidden") return;
      tick();
      timer = setInterval(tick, 1000);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [targetMs]);

  return targetMs === null || now === null ? null : remainingUntil(targetMs, now);
}
