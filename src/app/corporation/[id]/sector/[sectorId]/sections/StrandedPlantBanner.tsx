"use client";

import { useTranslations } from "next-intl";
import type { StrandedWarning } from "@/lib/corporations/rules/strandedWarning";
import { DELIVERY_LIMITED_MIN_SHARE } from "@/components/corporation/plantsPresentation";
import {
  FREIGHT_CLASS_LABELS,
  freightClassAction,
  freightClassExplanation,
  type FreightClass,
} from "@/lib/logistics/freightClass";
import {
  listOutputs,
  outputSalesSplit,
  type OutputSale,
} from "@/lib/corporations/rules/outputSalesSplit";

interface StrandedPlantBannerProps {
  /** What the plant page knows about poor sales (`truth.strandedWarning`); null shows nothing. */
  warning: StrandedWarning | null | undefined;
  /**
   * Last turn's delivery-limited share, 0-1. Above 1% the banner names freight
   * as the cause instead of oversupply: the advice below is the opposite in
   * that case, so getting it wrong sends the player to shrink a plant whose
   * goods buyers are still waiting for.
   */
  deliveryLimitedFraction?: number;
  /** The route type that prevented delivery, when known. */
  deliveryLimitedFreightClass?: FreightClass | null;
  isCeo: boolean;
  /** Each product this site makes, with its own sold share. */
  outputs?: readonly OutputSale[];
}

/**
 * Live warning shown while a plant is not selling most of its output. With a
 * funded sale record it states the latest settled turn; with only the legacy
 * market estimate it states that estimate's streak. Not dismissable and not
 * stored: it reflects a current condition and disappears on its own once the
 * plant sells again. The margin figure cannot warn the player here (units that
 * do sell still carry a healthy margin), so without this the first visible
 * symptom is a bank balance that never grows.
 */
export default function StrandedPlantBanner({
  warning,
  deliveryLimitedFraction = 0,
  deliveryLimitedFreightClass = null,
  isCeo,
  outputs,
}: StrandedPlantBannerProps) {
  const t = useTranslations("corporations.sectorInvestment");
  if (!warning) return null;
  const settled = warning.basis === "settlement";

  // A mixed site whose products split: name them instead of blaming the site.
  const split = outputSalesSplit(outputs);
  const pct = (x: number) => Math.round(x * 100);
  // The legacy delivery reading is measured against the legacy fill, so it
  // never explains a settled plant's sales.
  const deliveryLimited = !settled && deliveryLimitedFraction > DELIVERY_LIMITED_MIN_SHARE;
  const deliveryPct = Math.round(deliveryLimitedFraction * 100);
  const deliveryLabel = deliveryLimitedFreightClass
    ? FREIGHT_CLASS_LABELS[deliveryLimitedFreightClass]
    : "Delivery";
  const deliveryExplanation = deliveryLimitedFreightClass
    ? freightClassExplanation(deliveryLimitedFreightClass)
    : "The delivery network could not carry it to buyers outside this state.";
  const deliveryAction = deliveryLimitedFreightClass
    ? freightClassAction(deliveryLimitedFreightClass)
    : "Add logistics capacity in this state, or build nearer buyers.";

  return (
    <div
      role="status"
      aria-label="Stranded plant warning"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="text-body-lg leading-none">
          ⚠️
        </span>
        <div>
          <p className="text-body font-semibold text-foreground">
            {deliveryLimited
              ? "This plant cannot deliver its output"
              : split
                ? `${split.stuck.map((o) => o.label).join(" and ")} ${split.stuck.length === 1 ? "is" : "are"} not selling`
                : settled
                  ? "This plant is not selling most of its output"
                  : "This plant cannot sell its output"}
          </p>
          <p className="mt-0.5 text-body-sm text-muted">
            {warning.basis === "settlement"
              ? `Last turn buyers and the company's own sites took ${pct(warning.takenShare)}% of what this plant offered${
                  warning.turnsInRow != null
                    ? `, and it has sold less than half for ${warning.turnsInRow} turns in a row`
                    : ""
                }.`
              : `By the market estimate, for ${warning.turnsInRow} turns in a row this sector has sold less than half of what it makes${
                  warning.soldShare != null ? ` (last turn: ${pct(warning.soldShare)}%)` : ""
                }.`}{" "}
            {deliveryLimited
              ? `Last turn ${deliveryLabel} limited ${deliveryPct}% of what it offered, so that output earned no revenue while its production costs still landed. Buyers still want it. ${deliveryExplanation}`
              : split
                ? `${listOutputs(split.selling)} ${split.selling.some((o) => o.ownSites) ? "found buyers or fed your sites" : "found buyers"}, but ${listOutputs(split.stuck)} did not. The unsold part earns no revenue while its production costs still land.`
                : settled
                  ? "The unsold part earned no revenue while its production costs still landed."
                  : "The local market is oversupplied for its goods, so extra output earns no revenue this turn while its production costs still land."}{" "}
            Its margin still looks healthy because margin only counts the units that do sell.
          </p>
          {isCeo && (
            <p className="mt-1.5 text-body-sm text-muted">
              {deliveryLimited
                ? `Options: ${deliveryAction} Shrinking this plant gives up output the market is still short of.`
                : split
                  ? t("strandedMixedOptions", {
                      selling: split.selling.map((o) => o.label).join(" and "),
                    })
                  : t("strandedOptions")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
