"use client";

import type { ExchangeRateDisplay } from "@/app/country/[code]/forex/types";

interface Props {
  rates: ExchangeRateDisplay[];
  currentTurn: number;
}

/**
 * Public strip showing currently-posted Central Bank intervention bands.
 * Reserve numbers and per-turn spend amounts are deliberately hidden here — see the
 * Chair-only CentralBankInterventionTab for those.
 */
export function CentralBankPolicyStrip({ rates, currentTurn }: Props) {
  const withBands = rates.filter((r) => r.interventionBand != null);
  if (withBands.length === 0) return null;

  return (
    <div className="rounded-xl border border-card-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-bold text-foreground">Central bank policy</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {withBands.map((r) => {
          const band = r.interventionBand!;
          const turnsSince = band.setAtTurn == null ? null : currentTurn - band.setAtTurn;
          return (
            <div
              key={r.currencyCode}
              className="rounded border border-card-border px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.currencyCode}</span>
                {band.unreachable ? (
                  <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
                    Out of reach
                  </span>
                ) : band.defending ? (
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                    Defending
                  </span>
                ) : (
                  <span className="text-xs text-green-400">In band</span>
                )}
              </div>
              <p className="mt-1 font-mono text-xs text-muted">
                {band.floor === band.ceiling
                  ? `Peg target: ${band.floor.toFixed(4)}`
                  : `Band: [${band.floor.toFixed(4)}, ${band.ceiling.toFixed(4)}]`}
              </p>
              <p className="text-xs text-muted">
                {turnsSince == null
                  ? "Posting turn unknown"
                  : `Posted ${turnsSince} turn${turnsSince === 1 ? "" : "s"} ago`}
              </p>
              {band.defending && band.turnsToReach != null && (
                <p className={`text-xs ${band.unreachable ? "text-red-400" : "text-muted"}`}>
                  {band.unreachable
                    ? `The corridor is ${(Math.round((band.gapPct ?? 0) * 1000) / 10).toFixed(1)}% away. Even a game year of maximum-strength defence would not close it.`
                    : `${(Math.round((band.gapPct ?? 0) * 1000) / 10).toFixed(1)}% away, about ${band.turnsToReach} turn${band.turnsToReach === 1 ? "" : "s"} at maximum-strength defence.`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
