"use client";

import type { AskUpgradeOffer, AskUpgradeTier } from "@/components/askDrawer/askDrawerApi";

/** "4x Player energy, about 80 questions a day", in energy terms. */
export function tierEnergyLine(tier: AskUpgradeTier): string {
  const daily = tier.energy?.daily ?? tier.questions;
  const about = `about ${daily} ${daily === 1 ? "question" : "questions"} a day`;
  return tier.multiple && tier.multiple > 1 ? `${tier.multiple}x Player energy, ${about}` : about;
}

/** Shown when the player runs out: the Patreon tiers above theirs at today's price, in energy. */
export function AskUpgradeCard({ offer }: { offer: AskUpgradeOffer }) {
  if (!offer.tiers.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div className="mb-2 text-sm font-semibold text-foreground">Want more energy each day?</div>
      <div className="divide-y divide-card-border/60">
        {offer.tiers.map((tier) => (
          <div key={tier.key} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <div className="text-sm text-foreground">{tier.name}</div>
              <div className="text-[11px] text-muted">{tierEnergyLine(tier)}</div>
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
