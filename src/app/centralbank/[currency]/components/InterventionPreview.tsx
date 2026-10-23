"use client";
import {
  previewDefence,
  type DefencePreviewContext,
} from "@/lib/currency/intervention/rules/preview";
import type { DefencePolicy } from "@/lib/currency/intervention/rules/defence";

export function InterventionPreview({
  context,
  policy,
  currency,
}: {
  context: DefencePreviewContext;
  policy: DefencePolicy;
  currency: string;
}) {
  const quote = previewDefence(context, policy);
  if (!quote)
    return (
      <p className="text-body-sm text-warning">
        Enter valid bounds and a non-negative spending limit to see an estimate.
      </p>
    );
  const money = (n: number) =>
    `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return (
    <section
      aria-label="Intervention estimate"
      aria-live="polite"
      className="rounded-md border border-card-border bg-background p-4 text-body-sm"
    >
      <h3 className="mb-2 font-semibold">If conditions stay the same</h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted">Next-turn reserve draw</dt>
          <dd className="font-mono">{money(quote.spendHome)}</dd>
        </div>
        <div>
          <dt className="text-muted">Expected rate after intervention</dt>
          <dd className="font-mono">{quote.projectedRate.toFixed(6)}</dd>
        </div>
        <div>
          <dt className="text-muted">Expected rate without intervention</dt>
          <dd className="font-mono">{quote.unassistedRate.toFixed(6)}</dd>
        </div>
        <div>
          <dt className="text-muted">Action</dt>
          <dd>
            {quote.direction === "buy"
              ? "Buy home currency using foreign reserves"
              : quote.direction === "sell"
                ? "Sell home currency to acquire foreign reserves"
                : "No intervention needed"}
          </dd>
        </div>
      </dl>
      {(quote.budgetLimited || !quote.inBand) && (
        <p className="mt-2 text-warning">
          The spending limit, rate cap or available reserves restrict this defence. It may not reach
          your band this turn.
        </p>
      )}
      {quote.exhausted && (
        <p className="mt-2 text-error">
          No usable reserves for this direction. Domestic cash cannot fund purchases of the home
          currency.
        </p>
      )}
      {quote.fundamentalWarning && (
        <p className="mt-2 text-warning">
          This target looks difficult to sustain against current fundamentals, even with repeated
          intervention. Consider a band nearer the current rate or fundamentals.
        </p>
      )}
      {quote.reserveRunway !== null && (
        <p className="mt-2 text-muted">
          Existing usable reserves cover about {quote.reserveRunway.toFixed(1)} turns at this quoted
          spending, before new income or changing conditions.
        </p>
      )}
      <p className="mt-2 text-muted">
        Estimate, not a guaranteed rate or total cost. Uses current market activity, fundamentals
        and reserves, without random noise. Prices, trading and policy can change before the next
        turn.
      </p>
    </section>
  );
}
