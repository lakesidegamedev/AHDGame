"use client";

import type { AskUpgradeOffer } from "@/components/askDrawer/askDrawerApi";

/** Shown when the player runs out: the Patreon tiers above theirs at today's price. */
export function AskUpgradeCard({ offer }: { offer: AskUpgradeOffer }) {
  if (!offer.tiers.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div className="mb-2 text-sm font-semibold text-foreground">
        Want more questions each day?
      </div>
      <div className="divide-y divide-card-border/60">
        {offer.tiers.map((tier) => (
          <div key={tier.key} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <div className="text-sm text-foreground">{tier.name}</div>
              <div className="text-[11px] text-muted">
                {tier.questions} questions, {tier.liveQuestions} live-data questions a day
              </div>
            </div>
            <div className="shrink-0 text-sm font-semibold text-foreground">{tier.price}</div>
          </div>
        ))}
      </div>
      <a
        href={offer.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
      >
        Support on Patreon
      </a>
    </div>
  );
}
