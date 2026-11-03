"use client";

import { useTranslations } from "next-intl";
import type { UnsoldReading } from "@/lib/corporations/rules/unsoldReason";

/**
 * Why part of an output went unsold last turn (#5450). One explicit sentence
 * per reason, so a missing market price can never fall through to the
 * no-buyers sentence.
 */
export default function UnsoldNote({
  unsold,
  label,
  share,
  money,
}: {
  unsold: UnsoldReading;
  label: string;
  /** The unsold share, already formatted. */
  share: string;
  /** Formats a unit price in the display currency. */
  money: (unitPrice: number) => string;
}) {
  const t = useTranslations("corporations.unsoldOutput");
  const reason = (() => {
    switch (unsold.reason) {
      case "ask_above_market":
        return unsold.marketUnitPrice != null
          ? t("askAboveMarket", {
              ask: money(unsold.askUnitPrice),
              market: money(unsold.marketUnitPrice),
            })
          : t("askAboveMarketNoPrice");
      case "shared_at_market":
        return t("sharedAtMarket", { good: label });
      case "buyers_exhausted":
        return t("buyersExhausted");
      case "no_buyers":
        return t("noBuyers", { good: label });
      case "buyers_elsewhere":
        return unsold.elsewhere === "state"
          ? t("buyersElsewhereState", { good: label })
          : t("buyersElsewhereCountry", { good: label });
    }
  })();
  return (
    <p
      data-unsold-reason={unsold.reason}
      className="mt-2 rounded-lg border border-card-border bg-background/40 px-3 py-2 text-body-sm text-foreground"
    >
      {t("lead", { share, good: label })} {reason}
    </p>
  );
}
