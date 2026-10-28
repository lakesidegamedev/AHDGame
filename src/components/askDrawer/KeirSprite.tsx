"use client";

import { useEffect, useRef, useState } from "react";

// Keir, the Ask Keir character, drawn from the shared pixel-art sprite sheet
// (the same pack as the Ask Keir site and the Lakeside Ops app). Frame i of a
// state is at x = i * cell, y = row * cell on a 40px grid, scaled by whole
// numbers so the pixels stay crisp. Decoration only: aria-hidden.

export type KeirMood =
  | "idle"
  | "blink"
  | "wave"
  | "listening"
  | "thinking"
  | "talking"
  | "idea"
  | "alert"
  | "glasses_peek"
  | "glasses_glint"
  | "humming"
  | "tea_sip";

const SHEET = "/ask/keir-M.png";
const CELL = 40;
const SHEET_W = 400;
const SHEET_H = 1800;

export const KEIR_STATES: Record<
  KeirMood,
  { row: number; frames: number; fps: number; loop: boolean }
> = {
  idle: { row: 0, frames: 8, fps: 8, loop: true },
  blink: { row: 1, frames: 3, fps: 12, loop: false },
  talking: { row: 2, frames: 6, fps: 10, loop: true },
  listening: { row: 3, frames: 6, fps: 6, loop: true },
  thinking: { row: 4, frames: 6, fps: 6, loop: true },
  idea: { row: 5, frames: 4, fps: 6, loop: false },
  alert: { row: 8, frames: 4, fps: 6, loop: true },
  glasses_peek: { row: 22, frames: 6, fps: 6, loop: false },
  glasses_glint: { row: 23, frames: 6, fps: 12, loop: false },
  tea_sip: { row: 26, frames: 10, fps: 6, loop: false },
  humming: { row: 32, frames: 8, fps: 6, loop: true },
  wave: { row: 34, frames: 6, fps: 8, loop: false },
};

const VARIETY: KeirMood[] = ["glasses_peek", "glasses_glint", "tea_sip", "humming"];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Plays `mood`. One-shot moods (wave, idea, blink and the idle quirks) play
 * once and settle back to idle; while idle Keir blinks every few seconds and
 * now and then does something from the variety set.
 */
export function KeirSprite({ mood, scale = 1 }: { mood: KeirMood; scale?: number }) {
  const [playing, setPlaying] = useState<KeirMood>(mood);
  const [frame, setFrame] = useState(0);
  const idleTicks = useRef(0);

  /* eslint-disable react-hooks/set-state-in-effect -- the requested mood restarts the animation */
  useEffect(() => {
    setPlaying(mood);
    idleTicks.current = 0;
  }, [mood]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const state = KEIR_STATES[playing];
    let f = 0;
    setFrame(0);
    const timer = window.setInterval(() => {
      f += 1;
      if (f < state.frames) {
        setFrame(f);
        return;
      }
      if (!state.loop) {
        setPlaying("idle");
        return;
      }
      f = 0;
      setFrame(0);
      if (playing !== "idle") return;
      idleTicks.current += 1;
      if (idleTicks.current % 40 === 0) {
        setPlaying(VARIETY[Math.floor(Math.random() * VARIETY.length)]);
      } else if (idleTicks.current % 5 === 0) {
        setPlaying("blink");
      }
    }, 1000 / state.fps);
    return () => window.clearInterval(timer);
  }, [playing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const state = KEIR_STATES[playing];
  const px = CELL * scale;
  return (
    <span
      aria-hidden
      data-keir-mood={playing}
      className="inline-block shrink-0"
      style={{
        width: px,
        height: px,
        backgroundImage: `url(${SHEET})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${SHEET_W * scale}px ${SHEET_H * scale}px`,
        backgroundPosition: `${-(frame % state.frames) * px}px ${-state.row * px}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}
