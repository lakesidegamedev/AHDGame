"use client";

import { useEffect, useState } from "react";
import { TurnStatusLink } from "./TurnStatusLink";

const QUARTER_MS = 15 * 60_000;
const HALF_HOUR_MS = 30 * 60_000;
/** How long each label shows before the note fades to the other one. */
export const ROTATE_MS = 10_000;
const FADE_MS = 300;

/** Minutes since `lastMs`, or null before the first market update. */
export function minutesSince(lastMs: number | null, nowMs: number): number | null {
  if (lastMs === null || !Number.isFinite(lastMs)) return null;
  return Math.max(0, Math.floor((nowMs - lastMs) / 60_000));
}

/** Start of the next quarter-hour slot after `nowMs`. */
export function nextQuarterAt(nowMs: number): number {
  return (Math.floor(nowMs / QUARTER_MS) + 1) * QUARTER_MS;
}

/** Past this, the quarter-hour ticks are not landing and a countdown would mislead. */
const STALE_AFTER_MINUTES = 20;

/** Whole minutes until the next quarter-hour price refresh, at least 1. */
export function minutesUntilNextRefresh(nowMs: number): number {
  return Math.max(1, Math.ceil((nextQuarterAt(nowMs) - nowMs) / 60_000));
}

/** Whole minutes until the next election results tick (the turn at :00, the half tick at :30), at least 1. */
export function minutesUntilNextElectionTick(nowMs: number): number {
  const next = (Math.floor(nowMs / HALF_HOUR_MS) + 1) * HALF_HOUR_MS;
  return Math.max(1, Math.ceil((next - nowMs) / 60_000));
}

/**
 * Status bar note for the price refresh, which is separate from the turn:
 * stock prices refresh every 15 minutes (the turn at :00, market ticks at
 * :15/:30/:45). Counts down like the turn timer beside it. If no refresh has
 * landed for a while it says how old prices are instead. Both paths publish a
 * wall-clock marker; lastTurnProcessed belongs to the game clock. Every 10 s
 * it fades over to the countdown for the next election results tick and back.
 */
export function MarketTickNote({
  lastMarketTickAt,
  statusLink = false,
}: {
  lastMarketTickAt?: string | null;
  statusLink?: boolean;
}) {
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const [showElections, setShowElections] = useState(false);
  // Clock read after mount and on each rotation keeps SSR deterministic. The
  // label fades out just before the swap and back in once the text changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setNowMs(Date.now());
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setFading(true);
      fadeTimer = setTimeout(() => {
        setNowMs(Date.now());
        setShowElections((shown) => !shown);
        setFading(false);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => {
      clearInterval(id);
      clearTimeout(fadeTimer);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const parsed = lastMarketTickAt ? new Date(lastMarketTickAt).getTime() : Number.NaN;
  const lastMs = Number.isFinite(parsed) ? parsed : null;
  if (nowMs === null || lastMs === null) return null;
  const ago = minutesSince(lastMs, nowMs) ?? 0;
  const agoText = ago < 1 ? "just now" : `${ago} min ago`;
  const nextIn = minutesUntilNextRefresh(nowMs);
  const stale = ago > STALE_AFTER_MINUTES;
  const electionIn = minutesUntilNextElectionTick(nowMs);
  return (
    <TurnStatusLink
      enabled={statusLink}
      className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted sm:text-xs"
    >
      <span
        className="inline-flex items-center gap-1"
        title={`Stock prices refresh every 15 minutes, between turns too. Last refresh ${agoText}. Election results update every 30 minutes.`}
      >
        <svg
          className="h-3 w-3 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 17l6-6 4 4 8-8"
          />
        </svg>
        <span
          className={`inline-flex items-center transition-opacity duration-300 motion-reduce:transition-none ${
            fading ? "opacity-0" : "opacity-100"
          }`}
        >
          {showElections ? (
            <>
              <span className="hidden sm:inline">
                Election results in <span className="tabular-nums">{electionIn}m</span>
              </span>
              <span className="sm:hidden tabular-nums">Votes {electionIn}m</span>
            </>
          ) : stale ? (
            <>
              <span className="hidden sm:inline">Prices {ago}m old</span>
              <span className="sm:hidden tabular-nums">{ago}m old</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">
                Prices refresh in <span className="tabular-nums">{nextIn}m</span>
              </span>
              <span className="sm:hidden tabular-nums">{nextIn}m</span>
            </>
          )}
        </span>
      </span>
    </TurnStatusLink>
  );
}
