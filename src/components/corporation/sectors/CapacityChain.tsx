"use client";

import { useTranslations } from "next-intl";
import type { SectorDetail } from "../CorporationPageTypes";
import {
  DELIVERY_LIMITED_MIN_SHARE,
  formatFillPercent,
  formatUnits,
  plantCountLabel,
  sectorPlantCount,
} from "../plantsPresentation";
import {
  FREIGHT_CLASS_LABELS,
  freightClassAction,
  freightClassExplanation,
} from "@/lib/logistics/freightClass";

/**
 * How a plants sector gets from capacity to net profit: what it could make,
 * made, sold, earned, and kept. The revenue cell's tooltip and the margins
 * drawer both render this, so the two can never disagree.
 */
export function CapacityChain({
  sector,
  realized,
  operatingProfit,
  fillAdjusted,
  deliveryLimited,
  isMothballed,
  fmtScaled,
  fmtMoney,
  scaleFactor,
  variant,
}: {
  sector: SectorDetail;
  realized: number | null | undefined;
  operatingProfit: number | null;
  fillAdjusted: number | null;
  deliveryLimited: number | null;
  isMothballed: boolean;
  fmtScaled: (val: number | null | undefined) => string;
  fmtMoney: (val: number) => string;
  scaleFactor: number;
  /** "tooltip" keeps the compact hover layout; "block" is the drawer card. */
  variant: "tooltip" | "block";
}) {
  const t = useTranslations("corporations.sectorInvestment");
  const deliveryLimitedShown =
    deliveryLimited != null &&
    Number.isFinite(deliveryLimited) &&
    deliveryLimited > DELIVERY_LIMITED_MIN_SHARE;
  const deliveryClass = sector.deliveryLimitedFreightClass ?? null;
  const deliveryClassLabel = deliveryClass ? FREIGHT_CLASS_LABELS[deliveryClass] : "Delivery";
  const block = variant === "block";
  const row = `flex justify-between gap-3 ${block ? "py-1 text-[12px]" : ""}`;
  const note = `mt-1.5 leading-snug text-muted ${block ? "text-[11px]" : "text-[10px]"}`;
  const heading = "Plants → net profit";

  const body = (
    <>
      {block ? (
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
          {heading}
        </h4>
      ) : (
        <p className="font-semibold text-foreground mb-1">{heading}</p>
      )}
      <div className={`text-muted ${block ? "" : "space-y-0.5 text-xs"}`}>
        <div className={row}>
          <span>Plants</span>
          <span className="tabular-nums">
            {plantCountLabel(sectorPlantCount(sector), sector.sectorType)}
          </span>
        </div>
        <div className={row}>
          <span>Full output, units a day</span>
          <span className="tabular-nums">{formatUnits(sector.capacityUnits)}</span>
        </div>
        <div className={row}>
          <span>Produced</span>
          <span className="tabular-nums">{formatUnits(sector.producedUnits)}</span>
        </div>
        {sector.mediaAdvertisingCampaignUnits != null &&
          sector.mediaAdvertisingCampaignFactor != null && (
            <div className={row}>
              <span>{t("advertisingCampaignsLabel")}</span>
              <span className="tabular-nums">
                {t("advertisingCampaignsValue", {
                  units: formatUnits(sector.mediaAdvertisingCampaignUnits),
                  factor: formatFillPercent(sector.mediaAdvertisingCampaignFactor),
                })}
              </span>
            </div>
          )}
        <div className={row}>
          <span>Sold</span>
          <span className="tabular-nums">{formatUnits(sector.soldUnits)}</span>
        </div>
        <div className={`${row} border-t border-card-border pt-0.5`}>
          <span className="text-foreground">Revenue</span>
          <span className="tabular-nums text-success">{fmtScaled(realized)}</span>
        </div>
        <div className={row}>
          <span>× effective margin</span>
          <span className="tabular-nums">{sector.effectiveProfitMargin}%</span>
        </div>
        <div className={row}>
          <span>Operating profit</span>
          <span className="tabular-nums">{fmtScaled(operatingProfit)}</span>
        </div>
        <div className={`${row} border-t border-card-border pt-0.5 font-semibold`}>
          <span className="text-foreground">Net profit</span>
          <span className={`tabular-nums ${sector.profit >= 0 ? "text-success" : "text-error"}`}>
            {fmtMoney(sector.profit * scaleFactor)}
          </span>
        </div>
        {fillAdjusted != null && (
          <div className={row}>
            <span>Net margin</span>
            <span className={`tabular-nums ${fillAdjusted >= 0 ? "text-success" : "text-error"}`}>
              {fillAdjusted}%
            </span>
          </div>
        )}
      </div>
      {fillAdjusted != null && (
        <p className={note}>
          The effective margin counts only units that sold. Net margin is profit over revenue after
          paying for everything made, so unsold units pull it down.
        </p>
      )}
      {deliveryLimitedShown && (
        <p className={note}>
          {deliveryClassLabel} limited {formatFillPercent(deliveryLimited)} of this sector&apos;s
          output from reaching buyers outside the state.{" "}
          {deliveryClass
            ? freightClassExplanation(deliveryClass)
            : "The delivery network, not demand, is the limit."}{" "}
          {deliveryClass
            ? freightClassAction(deliveryClass)
            : "Add freight capacity or build nearer buyers."}
        </p>
      )}
      {isMothballed && (
        <p className={note}>
          These plants are mothballed. They produce nothing and pay reduced upkeep until you
          reactivate them.
        </p>
      )}
      {sector.lastDecommission && (
        <p className={note}>
          Unused capacity worth {fmtScaled(sector.lastDecommission.retiredBookAnchor)} was retired
          because this sector sold nothing for a long time.{" "}
          {sector.lastDecommission.grantAnchor > 0
            ? `A decommissioning grant of ${fmtScaled(sector.lastDecommission.grantAnchor)} was paid from unspent public funding.`
            : "No grant was paid: the country had no unspent public funding."}
        </p>
      )}
    </>
  );

  return block ? (
    <div className="rounded-[var(--corp-rad,6px)] border border-card-border bg-card p-3.5">
      {body}
    </div>
  ) : (
    body
  );
}
