"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Playback state for the Wrapped story: which slide is showing and whether its
 * timer runs. The timer is a JavaScript clock, never a CSS animation, so slide
 * timing survives devices that remove animations. The progress bar is a visual
 * follower: `barRef` has its width written each frame, with no React renders.
 * A slide can `hold()` the timer (the guess slide waits for an answer) and
 * `release()` it again. With `autoAdvance` off the story only moves on a tap.
 */
export interface StoryPlayer {
  index: number;
  paused: boolean;
  held: boolean;
  /** True while the active slide's progress animation should run. */
  running: boolean;
  /** Attach to the active progress segment's fill element. */
  barRef: RefObject<HTMLDivElement | null>;
  goTo: (i: number) => void;
  next: () => void;
  prev: () => void;
  togglePause: () => void;
  hold: () => void;
  release: () => void;
}

/** Longest frame gap counted as elapsed time, so a stalled tab cannot skip a slide. */
const MAX_FRAME_MS = 250;

export function useStoryPlayer(durations: number[], autoAdvance = true): StoryPlayer {
  const total = durations.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);

  const goTo = useCallback(
    (i: number) => {
      setHeld(false);
      setIndex(Math.max(0, Math.min(total - 1, i)));
    },
    [total]
  );
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const hold = useCallback(() => setHeld(true), []);
  const release = useCallback(() => setHeld(false), []);
  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const running =
    autoAdvance && !paused && !held && (durations[index] ?? 0) > 0 && index < total - 1;
  const barRef = useRef<HTMLDivElement | null>(null);
  const elapsed = useRef({ index: -1, ms: 0 });
  const duration = durations[index] ?? 0;

  useEffect(() => {
    if (elapsed.current.index !== index) elapsed.current = { index, ms: 0 };
    const paint = () => {
      if (barRef.current && duration > 0) {
        barRef.current.style.width = `${Math.min(100, (elapsed.current.ms / duration) * 100)}%`;
      }
    };
    paint();
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current.ms += Math.min(MAX_FRAME_MS, Math.max(0, now - last));
      last = now;
      paint();
      if (elapsed.current.ms >= duration) {
        goTo(index + 1);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, index, duration, goTo]);

  return {
    index,
    paused,
    held,
    running,
    barRef,
    goTo,
    next,
    prev,
    togglePause,
    hold,
    release,
  };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Count 0 to target over `ms` once `active` turns true; instant without motion. */
export function useCountUp(target: number, active: boolean, motion: boolean, ms = 1100): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active || !motion) return;
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / ms);
      setVal(target * easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, motion, ms]);
  if (!motion) return target;
  return active ? val : 0;
}
