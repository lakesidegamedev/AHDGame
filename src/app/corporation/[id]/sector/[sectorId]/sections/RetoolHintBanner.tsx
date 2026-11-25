"use client";

import { COMMODITY_LABELS } from "@/lib/constants/commoditiesCore";
import type { RetoolHint } from "@/lib/corporations/retoolHint";

interface RetoolHintBannerProps {
  hint: RetoolHint;
  isCeo: boolean;
  /** Opens the suggested strategy confirmation without submitting a change. */
  onOpenStrategy: (strategyId: string) => void;
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

/**
 * Shown while a plant sells only part of what it offers because its main
 * product is oversupplied in its market, and another strategy for this sector
 * would sell into a shortage in the same market. The plant's own figures come
 * from the record it was paid on and sit apart from the market's figure.
 *
 * COPY RULE: plain language, concrete numbers, no dashes.
 */
export default function RetoolHintBanner({ hint, isCeo, onOpenStrategy }: RetoolHintBannerProps) {
  const current = COMMODITY_LABELS[hint.currentMain.commodity] ?? hint.currentMain.commodity;
  const suggested = COMMODITY_LABELS[hint.suggestedMain.commodity] ?? hint.suggestedMain.commodity;
  const mixed = hint.currentMain.valueShare < 0.995;
  return (
    <div
      role="status"
      aria-label="Strategy suggestion"
      className="rounded-xl border border-info/40 bg-info/10 p-4"
    >
      <p className="text-body font-semibold text-foreground">
        This plant&apos;s main product is oversupplied here
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <section
          aria-label="This plant last turn"
          className="rounded-lg border border-border bg-surface p-3"
        >
          <p className="text-body-sm font-semibold uppercase tracking-wide text-muted">
            This plant, last turn
          </p>
          <p className="mt-1 text-body-sm text-muted">
            Buyers took {pct(hint.currentMain.fill)} of the {current} it offered.
            {mixed && (
              <>
                {" "}
                {current} is {pct(hint.currentMain.valueShare)} of its output by value, and across
                all its products it sold {pct(hint.currentValueFill)} by value.
              </>
            )}
          </p>
          {hint.runShare != null && (
            <p className="mt-1 text-body-sm text-muted">
              It ran at {pct(hint.runShare)} of its capacity.
            </p>
          )}
        </section>
        <section
          aria-label="This market"
          className="rounded-lg border border-border bg-surface p-3"
        >
          <p className="text-body-sm font-semibold uppercase tracking-wide text-muted">
            This market, all sellers
          </p>
          <p className="mt-1 text-body-sm text-muted">
            {pct(hint.currentMain.marketSurplusShare)} of the {current} on offer here had no buyer,
            going by the latest market book.
          </p>
        </section>
      </div>
      <p className="mt-2 text-body-sm text-muted">
        The {hint.suggestedStrategyName} strategy makes mostly {suggested}, and this market is{" "}
        {pct(hint.suggestedMain.unmetShare)} short of it. On {hint.suggestedStrategyName} this plant
        would sell about {pct(hint.suggestedValueFill)} of its output by value, enough to climb back
        toward full capacity. Changing strategy costs money and takes a few turns to complete; the
        strategy panel shows both.
      </p>
      {isCeo && (
        <button
          type="button"
          onClick={() => onOpenStrategy(hint.suggestedStrategyId)}
          className="mt-2 rounded-lg border border-info/40 px-3 py-1.5 text-body-sm font-medium text-foreground hover:bg-info/15"
        >
          Review {hint.suggestedStrategyName} retool
        </button>
      )}
    </div>
  );
}
