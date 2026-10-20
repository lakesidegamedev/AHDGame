"use client";

import { useState } from "react";
import Link from "next/link";
import {
  OPERATING_SECTOR_TYPES,
  OPERATING_SECTOR_TYPE_LABELS,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import { apiErrorText } from "@/lib/errors/catalog";

/**
 * Market transition package for an over-built business: turns left, and the
 * one free conversion to another industry at book value. Shown to the CEO
 * only while the window is open, so every element is something they can act on.
 */
export function TransitionPanel({
  corpId,
  sectorId,
  currentLane,
  turnsLeft,
  freeConversion,
  buildUrl,
}: {
  corpId: string;
  sectorId: string;
  currentLane: OperatingSectorType;
  turnsLeft: number;
  freeConversion: boolean;
  /** The build planner, where plants can be mothballed. */
  buildUrl: string;
}) {
  const lanes = OPERATING_SECTOR_TYPES.filter((lane) => lane !== currentLane);
  const [target, setTarget] = useState<OperatingSectorType>(lanes[0]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convert = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/corporations/${corpId}/sectors/${sectorId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLane: target }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      setError(apiErrorText(await res.json(), "Conversion failed"));
    } catch {
      setError("Conversion failed");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-foreground">Market transition</span>
        <span className="tabular-nums text-muted">
          {turnsLeft} turn{turnsLeft === 1 ? "" : "s"} left
        </span>
      </div>
      <p className="mt-1 leading-snug text-muted">
        Real demand for this business is well below what it used to earn. It gets fading revenue
        support while the window is open.{" "}
        {freeConversion
          ? "You can convert it to another industry once, free, keeping its value, or mothball it with no upkeep."
          : "You can still mothball it with no upkeep."}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {freeConversion && (
          <>
            <select
              aria-label="Convert to industry"
              className="rounded border border-card-border bg-background px-2 py-1 text-xs text-foreground"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value as OperatingSectorType);
                setConfirming(false);
              }}
              disabled={busy}
            >
              {lanes.map((lane) => (
                <option key={lane} value={lane}>
                  {OPERATING_SECTOR_TYPE_LABELS[lane]}
                </option>
              ))}
            </select>
            {confirming ? (
              <button
                type="button"
                className="rounded bg-warning px-2.5 py-1 text-xs font-semibold text-background disabled:opacity-60"
                onClick={convert}
                disabled={busy}
              >
                {busy
                  ? "Converting"
                  : `Confirm: convert to ${OPERATING_SECTOR_TYPE_LABELS[target]}`}
              </button>
            ) : (
              <button
                type="button"
                className="rounded border border-warning/40 px-2.5 py-1 text-xs font-semibold text-foreground"
                onClick={() => setConfirming(true)}
              >
                Convert
              </button>
            )}
          </>
        )}
        <Link href={buildUrl} className="text-xs font-medium text-accent hover:underline">
          Mothball
        </Link>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
