"use client";

import type { InfluenceResult } from "./useInfluencePanelState";
import { formatLocalFunds } from "@/lib/actions";
import type { CurrencyCode } from "@/lib/constants/currencies";

/**
 * Shared loading state for influence panels.
 */
export function InfluencePanelLoading() {
  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <div className="text-center text-muted">Loading influence options...</div>
    </div>
  );
}

/**
 * Shared error state for influence panels.
 */
export function InfluencePanelError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
      <div className="text-red-400">{message}</div>
    </div>
  );
}

/**
 * Shared result message display for influence panels.
 */
export function InfluenceResultMessage({ result }: { result: InfluenceResult }) {
  return (
    <div
      role="status"
      className={`mb-4 rounded-lg p-3 text-sm ${
        result.success
          ? "bg-green-500/20 text-green-400"
          : result.outcome === "backfire"
            ? "bg-red-500/20 text-red-400"
            : "bg-yellow-500/20 text-yellow-400"
      }`}
    >
      {result.message}
    </div>
  );
}

/**
 * Inline error message for influence panels.
 */
export function InfluenceErrorMessage({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-4 rounded-lg bg-red-500/20 p-3 text-sm text-red-400">
      {message}
    </div>
  );
}

interface CostAndChanceSummaryProps {
  actionCost: number;
  fundCost: number;
  /** Currency to format the fund cost in (defaults to USD). */
  currency?: CurrencyCode;
  estimatedChance: number;
  successLabel?: string;
}

/**
 * Shared cost and chance summary for influence panels.
 */
export function CostAndChanceSummary({
  actionCost,
  fundCost,
  currency = "USD",
  estimatedChance,
  successLabel,
}: CostAndChanceSummaryProps) {
  const isLikely = estimatedChance >= 50;
  const chipLabel = successLabel ?? (isLikely ? "Likely to Accept" : "Likely to Decline");

  return (
    <div className="rounded-lg bg-background p-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted">Action cost:</span>{" "}
          <span className="font-medium">{actionCost}</span>
        </div>
        {fundCost > 0 && (
          <div>
            <span className="text-muted">Fund cost:</span>{" "}
            <span className="font-medium text-green-400">
              {formatLocalFunds(fundCost, currency)}
            </span>
          </div>
        )}
        <div className="col-span-2">
          <span className="text-muted">Estimated response:</span>{" "}
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
              isLikely
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-red-500/40 bg-red-500/15 text-red-300"
            }`}
          >
            {chipLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
