"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { CommodityData } from "@/app/country/[code]/stockmarket/types";
import { PanelState, pctText, toneClass, vsBasePct } from "./marketUi";
import { atPriceCap, compareByDistanceFromBase } from "@/lib/market/overviewPreview";
import { cappedGoodNote, cappedGoodTarget } from "@/lib/market/cappedGoodTarget";
import {
  balancePressure,
  premiumTrendSentence,
  scarcityMultFromAttribution,
} from "@/lib/market/priceBreakdownRules";
import { FUNDED_SCARCITY_MAX_MOVE } from "@/lib/market/scarcityDrift";
import { priceCapBasisText } from "@/lib/market/priceCapBasis";
import { formatCount } from "@/lib/ui/numbers";

function balance(c: CommodityData): { label: string; tone: string; title?: string } {
  if (c.globalDemand <= 0 && c.globalSupply <= 0) return { label: "No trade", tone: "text-muted" };
  // A good sold only inside each state has no world balance a plant can sell
  // into: name the states that are short instead of a world total.
  const local = c.stateShortage;
  if (local && local.tradingStates > 0) {
    const title = `Sold only inside each state: a plant sells to buyers in its own state, not the world. ${local.shortStates} of ${local.tradingStates} states trading it are short. The supply and demand totals add every state together.`;
    return local.shortStates > 0
      ? {
          label: `Short in ${local.shortStates} of ${local.tradingStates} states`,
          tone: "text-error",
          title,
        }
      : { label: "Supplied in every state", tone: "text-success", title };
  }
  const ratio = c.globalSupply / Math.max(c.globalDemand, 1e-9);
  if (ratio < 0.95) return { label: "Short", tone: "text-error" };
  if (ratio > 1.05) return { label: "Surplus", tone: "text-success" };
  return { label: "Balanced", tone: "text-muted" };
}

const CAP_TITLE =
  "The price is at the highest level the market allows, so goods at the cap share the same figure.";

/** Tooltip for the price-vs-base cell: the stored scarcity premium and which way it is moving. */
export function premiumTitle(c: CommodityData): string | undefined {
  const mult = scarcityMultFromAttribution(c.priceAttribution ?? null);
  if (mult == null) return undefined;
  // The premium moves on what the price reads, not on the world supply shown.
  const supply = c.pricingSupply ?? c.globalSupply;
  const pressure = balancePressure(supply, c.pricingDemand ?? c.globalDemand);
  const leavesOut = c.globalSupply > supply * (1 + 1e-6);
  return `Scarcity premium ${mult.toFixed(2)}x on the base price. It builds up while a good is short and eases back at a set pace after supply catches up. ${premiumTrendSentence(pressure, FUNDED_SCARCITY_MAX_MOVE, leavesOut)}`;
}

export function CommoditiesPanel({
  commodities,
  loading,
  error,
  supplyEnabled,
}: {
  commodities: CommodityData[] | null;
  loading: boolean;
  error: string;
  supplyEnabled: boolean;
}) {
  const { formatPrice, inputSymbol } = useCurrency();
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return [...(commodities ?? [])]
      .filter((c) => !needle || c.label.toLowerCase().includes(needle))
      .sort(compareByDistanceFromBase);
  }, [commodities, filter]);

  return (
    <PanelState loading={loading} error={error} empty={(commodities ?? []).length === 0}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter commodities"
            aria-label="Filter commodities"
            className="h-8 w-full rounded-md border border-card-border bg-background px-2 text-[13px] text-foreground focus:border-foreground focus:outline-none sm:w-64"
          />
          <Link
            href="/commodity/shortages"
            className="text-xs font-medium text-primary hover:underline"
          >
            Regional shortages →
          </Link>
        </div>
        <p className="text-xs text-muted">
          Prices are world averages per unit, shown in {inputSymbol}. A commodity page for one
          country shows that country&apos;s own market price in its currency, so the two can differ.
        </p>
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-body-sm text-muted">
                <th className="px-3 py-2 font-medium">Commodity</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th
                  className="px-3 py-2 text-right font-medium"
                  title="Against the original base price, before the inflation adjustment."
                >
                  vs original base
                </th>
                <th className="px-3 py-2 text-right font-medium">Last turn</th>
                <th
                  className="px-3 py-2 text-right font-medium"
                  title="Price change over the available history, expressed as a yearly rate."
                >
                  Yearly rate
                </th>
                <th className="px-3 py-2 text-right font-medium">Supply / demand per turn</th>
                <th className="px-3 py-2 font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const base = vsBasePct(c);
                const bal = balance(c);
                const capTarget = atPriceCap(c) ? cappedGoodTarget(c) : null;
                return (
                  <tr key={c.commodity} className="border-b border-card-border/50 last:border-b-0">
                    <td className="px-3 py-2 font-medium text-foreground">{c.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPrice(c.globalPrice)}
                      <span className="text-xs text-muted"> /{c.unit}</span>
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${toneClass(base)}`}
                      title={premiumTitle(c)}
                    >
                      {pctText(base)}
                      {atPriceCap(c) && (
                        <span
                          className="ml-1 text-xs text-muted"
                          title={[CAP_TITLE, premiumTitle(c)].filter(Boolean).join(" ")}
                        >
                          at price cap
                          {priceCapBasisText(c.priceCapBasis) && (
                            <span className="block">{priceCapBasisText(c.priceCapBasis)}</span>
                          )}
                          {capTarget && <span className="block">{cappedGoodNote(capTarget)}</span>}
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${toneClass(c.lastTurnPriceChange)}`}
                    >
                      {pctText(c.lastTurnPriceChange)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${toneClass(c.priceChange)}`}>
                      {pctText(c.priceChange)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {formatCount(c.globalSupply)} / {formatCount(c.globalDemand)}
                      {c.backgroundEconomy &&
                        (c.backgroundEconomy.sold > 0 || c.backgroundEconomy.bought > 0) && (
                          <span
                            className="block text-[10px]"
                            title="Included in the totals: the background economy's sales and purchases."
                          >
                            incl. background economy {formatCount(c.backgroundEconomy.sold)} sold /{" "}
                            {formatCount(c.backgroundEconomy.bought)} bought
                          </span>
                        )}
                    </td>
                    <td className={`px-3 py-2 text-xs font-medium ${bal.tone}`} title={bal.title}>
                      {bal.label}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <Link
                        href={`/commodity/${c.commodity}`}
                        className="text-primary hover:underline"
                      >
                        Detail
                      </Link>
                      {supplyEnabled && (
                        <>
                          {" · "}
                          <Link
                            href={`/commodity/${c.commodity}/offers`}
                            className="text-primary hover:underline"
                          >
                            Offers
                          </Link>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PanelState>
  );
}
