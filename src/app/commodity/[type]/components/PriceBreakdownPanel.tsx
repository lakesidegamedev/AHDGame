"use client";

import { premiumTrendSentence } from "@/lib/market/priceBreakdownRules";
import type { ScarcityBreakdown } from "@/lib/market/priceBreakdownRules";

const mult = (n: number) => `${n.toFixed(2)}x`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function changeText(b: ScarcityBreakdown): string {
  if (b.scarcityChange == null) return "no earlier turn on record";
  if (b.direction === "steady") return "unchanged since last turn";
  return `${b.direction === "rising" ? "up" : "down"} ${pct(Math.abs(b.scarcityChange))} since last turn`;
}

export default function PriceBreakdownPanel({
  breakdown,
  formatPrice,
}: {
  breakdown: ScarcityBreakdown | null | undefined;
  formatPrice: (n: number) => string;
}) {
  if (!breakdown) return null;
  return (
    <section
      aria-label="Price breakdown"
      className="mb-4 rounded-lg border border-card-border bg-card p-4 text-sm"
    >
      <h2 className="mb-2 text-base font-semibold">What is in this price</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Base price</dt>
          <dd className="tabular-nums">{formatPrice(breakdown.nominalBase)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Scarcity premium</dt>
          <dd className="tabular-nums">
            {mult(breakdown.scarcityMult)} ({changeText(breakdown)})
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Producer cost pass-through</dt>
          <dd className="tabular-nums">{mult(breakdown.costPassThrough)}</dd>
        </div>
        {breakdown.priceMultiple != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Price against base</dt>
            <dd className="tabular-nums">{mult(breakdown.priceMultiple)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-2 text-xs text-muted">
        The premium builds up while a good is short and only eases back at a set pace once supply
        catches up, so a well supplied good can still sit near its top price for a while.{" "}
        {premiumTrendSentence(
          breakdown.pressure,
          breakdown.maxMovePerTurn,
          breakdown.pricingLeavesOutBackground
        )}
      </p>
    </section>
  );
}
