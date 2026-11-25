"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { InfoTooltip } from "@/components/InfoTooltip";
import { GOUGE_JUMP, CONSISTENCY_BAND } from "@/lib/market/brandLoyalty";
import type { PricingData } from "../types";
import { apiErrorText } from "@/lib/errors/catalog";
import { ownSiteLabel } from "@/lib/corporations/ownSiteDeliveries";
import { useCurrency } from "@/contexts/CurrencyContext";
import { COMMODITY_LABELS, type CommodityType } from "@/lib/constants/commoditiesCore";

const POSTURE_STEPS = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2] as const;

function postureLabel(p: number): string {
  if (p === 0) return "Market";
  return `${p > 0 ? "+" : ""}${Math.round(p * 100)}%`;
}

interface PricingPanelProps {
  corporationId: string;
  sectorId: string;
  isCeo: boolean;
  pricing: PricingData;
}

/**
 * Posted-price pricing posture (marketSystemMode >= "clearing", audit t806
 * Fix 2). Undercut to fill your order book first; skim for margin and risk
 * selling last. Self-contained: manages its own draft/save state.
 */
export default function PricingPanel({
  corporationId,
  sectorId,
  isCeo,
  pricing,
}: PricingPanelProps) {
  const supplyText = useTranslations("corporations.internalSupply");
  const costPlusText = useTranslations("corporations.costPlusPricing");
  const { formatPrice } = useCurrency();
  const [draft, setDraft] = useState<number | null>(pricing.posture);
  const [pricingMode, setPricingMode] = useState<"market" | "costPlus">(
    pricing.pricingMode ?? "market"
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const save = async (value: number | null, mode: "market" | "costPlus" = pricingMode) => {
    setSaving(true);
    setMessage("");
    setIsError(false);
    try {
      const res = await fetch(`/api/corporations/${corporationId}/sectors/${sectorId}/pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pricingPosture: value,
          pricingMode: mode,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        pricingPosture?: number | null;
        pricingMode?: "market" | "costPlus";
      };
      if (!res.ok) {
        setIsError(true);
        setMessage(apiErrorText(data, "Failed to update pricing"));
        return;
      }
      setDraft(data.pricingPosture ?? null);
      setPricingMode(data.pricingMode ?? mode);
      setMessage(
        data.pricingPosture == null
          ? "Pricing set to automatic."
          : mode === "costPlus"
            ? costPlusText("saved", { markup: `${Math.round(data.pricingPosture * 100)}%` })
            : `Posted price set to ${postureLabel(data.pricingPosture)} vs market.`
      );
    } catch {
      setIsError(true);
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  };

  const sold = pricing.soldFraction;
  // A plant with a funded sale record reads only that record. Without one the
  // figures are the legacy market pass's estimate, and say so.
  const settled = pricing.salesBasis === "settlement";
  const estimate = pricing.salesBasis === "estimate";
  // Output handed to the company's own sites is no sale, but the plant was used.
  const ownSite = pricing.ownSiteFraction ?? 0;
  const used = Math.min(1, (sold ?? 0) + ownSite);
  const ownSiteText = ownSiteLabel(ownSite);

  // Brand loyalty (Package A): warn the CEO before a sharp upward reprice away
  // from the corp's own price identity. Only when the norm is exposed (owner).
  const norm = pricing.brandPostureNorm;
  const pending = draft;
  const brandWarning: "gouge" | "drift" | null =
    norm != null && pending != null
      ? pending > norm + GOUGE_JUMP
        ? "gouge"
        : Math.abs(pending - norm) > CONSISTENCY_BAND
          ? "drift"
          : null
      : null;

  if (!isCeo) {
    return (
      <p className="text-body text-muted">
        {pricing.posture == null
          ? "This sector prices its output automatically."
          : pricingMode === "costPlus"
            ? `This sector prices its output at ${Math.round(pricing.posture * 100)}% above operating costs.`
            : `This sector prices its output at ${postureLabel(pricing.posture)} relative to the market.`}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-heading font-bold text-foreground">Pricing posture</h2>
        {sold != null && (
          <InfoTooltip
            trigger={
              <span
                className={`text-body-sm font-semibold tabular-nums underline decoration-dotted underline-offset-2 ${
                  used >= 0.995 ? "text-success" : used >= 0.7 ? "text-warning" : "text-error"
                }`}
              >
                {Math.round(sold * 100)}% sold of units offered last turn (all outputs)
                {ownSiteText ? `, ${ownSiteText}` : ""}
                {estimate ? " (market estimate)" : ""}
              </span>
            }
            width={260}
          >
            <p className="text-muted text-body-sm">
              Share of the units this sector offered that found a buyer last turn, blended across
              every commodity it makes and weighted by the amount offered. The corporation page
              instead counts sold units against what the sector produced. Cheaper sellers fill
              first. A sector with two outputs can sell one out completely and the other hardly at
              all and still land in the middle here. See Commodity Flows for the per-output rates.
              {ownSiteText
                ? " Output sent to your own sites is not a sale and earns no revenue, so it is counted separately."
                : ""}
              {estimate
                ? " This plant has no settled sales record yet, so this is the market's estimate, not a count of units buyers paid for."
                : ""}
            </p>
          </InfoTooltip>
        )}
      </div>
      <p className="text-body-sm text-muted mb-4">
        {pricingMode === "costPlus"
          ? costPlusText("explanation")
          : "Automatic asks a steady market price that moves at most 6% a turn, and a set posture is measured from the same price, so undercutting cannot drag it down 20% a turn. Unsold stock is marked down the next turn. When one price sells out and a higher one does not, the next ask lands halfway between them, so the price narrows in on the best level instead of swinging every other turn. Demand fills the cheapest sellers first. Undercut to sell out ahead of rivals, or skim for margin and risk holding unsold output."}
      </p>

      {pricing.asks && pricing.asks.length > 0 && (
        <ul className="mb-3 space-y-0.5 text-body-sm" aria-label="Asking prices last turn">
          {pricing.asks.map((a) => (
            <li key={a.commodity} className="flex justify-between gap-3 tabular-nums">
              <span className="text-muted">
                {COMMODITY_LABELS[a.commodity as CommodityType] ?? a.commodity}
              </span>
              <span>
                asked{" "}
                <span className="font-semibold text-foreground">
                  {formatPrice(a.askingUnitPrice)}
                </span>
                {a.paidUnitPrice != null && (
                  <>
                    , you were paid{" "}
                    <span className="font-semibold text-foreground">
                      {formatPrice(a.paidUnitPrice)}
                    </span>{" "}
                    on average
                  </>
                )}
                {a.marketUnitPrice != null && (
                  <>
                    , lane price{" "}
                    <span className="font-semibold text-foreground">
                      {formatPrice(a.marketUnitPrice)}
                    </span>
                  </>
                )}
                {a.costPlus && (
                  <span className="block text-muted">
                    {a.costPlus.unitCost == null
                      ? "Cost-plus: no settled run to price from yet, so this ask was the market price."
                      : a.costPlus.capped
                        ? `Cost-plus: ${formatPrice(a.costPlus.unitCost)} cost per unit made last run plus ${Math.round(a.costPlus.markup * 100)}% would pass 3x the reference price, so the ask was capped there.`
                        : `Cost-plus: ${formatPrice(a.costPlus.unitCost)} cost per unit made last run plus ${Math.round(a.costPlus.markup * 100)}% = ${formatPrice(a.costPlus.unitCost * (1 + a.costPlus.markup))}.`}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mb-3 text-body-sm text-muted">
        {supplyText("pricingHint")}{" "}
        <Link className="underline" href={`/corporation/${corporationId}?tab=ceo`}>
          {supplyText("pricingLink")}
        </Link>
      </p>
      {(pricing.costPlusEnabled || pricingMode === "costPlus") &&
        (pricing.costPlusReady || pricingMode === "costPlus") && (
          <div className="flex gap-2 mb-3" aria-label="Pricing basis">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(draft, "market")}
              aria-pressed={pricingMode === "market"}
              className="rounded-lg border border-card-border px-3 py-1.5 text-body-sm disabled:opacity-50"
            >
              {costPlusText("marketMode")}
            </button>
            {pricing.costPlusEnabled && pricing.costPlusReady && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(draft ?? 0.1, "costPlus")}
                aria-pressed={pricingMode === "costPlus"}
                className="rounded-lg border border-card-border px-3 py-1.5 text-body-sm disabled:opacity-50"
              >
                {costPlusText("costPlusMode")}
              </button>
            )}
          </div>
        )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {(pricingMode !== "costPlus" || (pricing.costPlusEnabled && pricing.costPlusReady)) &&
          POSTURE_STEPS.map((p) => {
            const active = draft === p;
            return (
              <button
                key={p}
                type="button"
                disabled={saving}
                onClick={() => void save(p)}
                title={
                  p < 0
                    ? "Undercut the market: thinner margin per unit, but your order book fills first."
                    : p > 0
                      ? "Premium: more revenue per unit sold, but you sell last, so in a glut this output can go unsold."
                      : "Sell at the market price."
                }
                className={`rounded-lg border px-3 py-1.5 text-body-sm font-medium tabular-nums transition-colors disabled:opacity-50 ${
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-card-border bg-background hover:bg-card"
                }`}
              >
                {postureLabel(p)}
              </button>
            );
          })}
        {(draft !== null || pricingMode !== "market") && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(null, "market")}
            title="Let the sector position itself: skim mild premiums into shortages, undercut into gluts."
            className={`rounded-lg border px-3 py-1.5 text-body-sm font-medium transition-colors disabled:opacity-50 ${
              draft === null
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-card-border bg-background hover:bg-card"
            }`}
          >
            Auto
          </button>
        )}
      </div>

      {message ? (
        <p className={`text-body-sm mb-2 ${isError ? "text-error" : "text-success"}`} role="status">
          {message}
        </p>
      ) : null}

      {brandWarning ? (
        <p
          className={`text-body-sm mb-2 ${brandWarning === "gouge" ? "text-warning" : "text-muted"}`}
          role="status"
        >
          {brandWarning === "gouge"
            ? "This sharp price hike will damage brand loyalty."
            : "Pricing away from your norm slows loyalty growth."}
        </p>
      ) : null}

      <div className="pt-3 border-t border-card-border flex items-center justify-between text-body">
        <InfoTooltip
          trigger={
            <span className="text-muted border-b border-dotted border-muted/40 cursor-default">
              {settled
                ? "Paid against asking price (last turn)"
                : `Clearing result (last turn${estimate ? ", market estimate" : ""})`}
            </span>
          }
          width={300}
        >
          {settled ? (
            <p className="text-muted text-body-sm">
              What this plant was paid last turn, against what the units it offered for outside sale
              would have earned at its asking price. Output sent to your own sites is left out.
              {sold != null ? ` ${Math.round(sold * 100)}% of what it offered sold.` : ""} Units
              nobody bought earn nothing, so selling 80% of the offer at the asking price reads
              ×0.80. The lane price in the list above is what cleared the whole lane, not what this
              plant was paid, so it can differ from this figure.
            </p>
          ) : (
            <p className="text-muted text-body-sm">
              Realized revenue = sold share × your posted price × the market price level, faded in
              over 5 game years so repositioning never causes a revenue cliff.
              {pricing.effectivePosture != null && (
                <>
                  {" "}
                  Effective posture used:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {postureLabel(pricing.effectivePosture)}
                  </span>
                  {pricing.posture == null ? " (automatic)" : ""}.
                </>
              )}
            </p>
          )}
        </InfoTooltip>
        <span
          className={`font-bold tabular-nums ${
            pricing.clearingFactor == null || Math.abs(pricing.clearingFactor - 1) < 0.005
              ? "text-muted"
              : pricing.clearingFactor > 1
                ? "text-success"
                : "text-error"
          }`}
        >
          {pricing.clearingFactor == null ? "n/a" : `×${pricing.clearingFactor.toFixed(2)}`}
        </span>
      </div>

      {pricing.clearingFactor == null && (
        <p className="mt-2 text-body-sm italic text-muted">
          {settled
            ? "Nothing was offered for outside sale last turn."
            : "Clearing figures appear after the next turn."}
        </p>
      )}
    </div>
  );
}
