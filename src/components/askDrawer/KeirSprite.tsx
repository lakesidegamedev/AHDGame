"use client";

import { useEffect, useRef, useState } from "react";

// Keir, the Ask Keir character, drawn from the shared pixel-art sprite sheet
// (the same pack as the Ask Keir site and the Lakeside Ops app). Frame i of a
// state is at x = i * cell, y = row * cell on a 40px grid, scaled by whole
// numbers so the pixels stay crisp. Decoration only: aria-hidden.

// Every state on the sheet: row, frame count, playback speed, and whether it
// loops (the rest play once and settle back to idle).
export const KEIR_STATES = {
  idle: { row: 0, frames: 8, fps: 8, loop: true },
  blink: { row: 1, frames: 3, fps: 12, loop: false },
  talking: { row: 2, frames: 6, fps: 10, loop: true },
  listening: { row: 3, frames: 6, fps: 6, loop: true },
  thinking: { row: 4, frames: 6, fps: 6, loop: true },
  idea: { row: 5, frames: 4, fps: 6, loop: false },
  working: { row: 6, frames: 6, fps: 8, loop: true },
  reading: { row: 7, frames: 6, fps: 6, loop: true },
  alert: { row: 8, frames: 4, fps: 7, loop: true },
  error: { row: 9, frames: 4, fps: 6, loop: false },
  celebrate: { row: 10, frames: 6, fps: 8, loop: false },
  sleeping: { row: 11, frames: 8, fps: 3, loop: true },
  waking: { row: 12, frames: 4, fps: 6, loop: false },
  happy: { row: 13, frames: 4, fps: 6, loop: false },
  laughing: { row: 14, frames: 6, fps: 8, loop: false },
  surprised: { row: 15, frames: 4, fps: 6, loop: false },
  sceptical: { row: 16, frames: 4, fps: 6, loop: false },
  concerned: { row: 17, frames: 4, fps: 6, loop: false },
  sad: { row: 18, frames: 4, fps: 6, loop: false },
  stern: { row: 19, frames: 4, fps: 6, loop: false },
  confused: { row: 20, frames: 6, fps: 6, loop: false },
  thumbs_up: { row: 21, frames: 6, fps: 8, loop: false },
  glasses_peek: { row: 22, frames: 6, fps: 6, loop: false },
  glasses_glint: { row: 23, frames: 6, fps: 12, loop: false },
  wink: { row: 24, frames: 4, fps: 8, loop: false },
  eye_roll: { row: 25, frames: 6, fps: 8, loop: false },
  tea_sip: { row: 26, frames: 10, fps: 6, loop: false },
  nervous: { row: 27, frames: 4, fps: 6, loop: false },
  shrug: { row: 28, frames: 4, fps: 6, loop: false },
  brow_wiggle: { row: 29, frames: 6, fps: 8, loop: false },
  facepalm: { row: 30, frames: 6, fps: 6, loop: false },
  red_box: { row: 31, frames: 6, fps: 6, loop: false },
  humming: { row: 32, frames: 8, fps: 6, loop: true },
  dizzy: { row: 33, frames: 4, fps: 6, loop: false },
  wave: { row: 34, frames: 6, fps: 8, loop: false },
  point: { row: 35, frames: 6, fps: 6, loop: true },
  phone: { row: 36, frames: 6, fps: 6, loop: false },
  nod: { row: 37, frames: 4, fps: 6, loop: false },
  shake_no: { row: 38, frames: 6, fps: 8, loop: false },
  yawn: { row: 39, frames: 6, fps: 5, loop: false },
  blush: { row: 40, frames: 4, fps: 6, loop: false },
  fuming: { row: 41, frames: 6, fps: 8, loop: false },
  gloom: { row: 42, frames: 6, fps: 6, loop: false },
  look_left: { row: 43, frames: 2, fps: 2, loop: false },
  look_right: { row: 44, frames: 2, fps: 2, loop: false },
} satisfies Record<string, { row: number; frames: number; fps: number; loop: boolean }>;

export type KeirMood = keyof typeof KEIR_STATES;

const SHEET = "/ask/keir-M.png";
const CELL = 40;
const SHEET_W = 400;
const SHEET_H = 1800;

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

/**
 * Keir's head and shoulders in a circle, for small places (the phone button,
 * the drawer header) where the full bust at 40px reads as a smudge. The sprite
 * is scaled up and centred on his face; the circle crops the rest.
 */
export function KeirAvatar({ mood, size = 36 }: { mood: KeirMood; size?: number }) {
  const scale = (size * 1.15) / CELL;
  const px = CELL * scale;
  return (
    <span
      aria-hidden
      data-keir-avatar
      className="relative inline-block shrink-0 overflow-hidden rounded-full bg-card-elevated"
      style={{ width: size, height: size }}
    >
      <span className="absolute" style={{ left: size / 2 - px * 0.5, top: size / 2 - px * 0.46 }}>
        <KeirSprite mood={mood} scale={scale} />
      </span>
    </span>
  );
}
