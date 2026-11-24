"use client";

import { HeroImage } from "@/components/HeroImage";
import { COMMODITY_HERO_SLUGS, COMMODITY_HERO_ALTS } from "@/lib/constants/commoditiesCore";
import type { CommodityType } from "@/lib/constants/commoditiesCore";
import { formatCurrencyPrecise } from "@/lib/utils/formatters";
import BackButton from "@/components/BackButton";
import { formatUnits } from "../lib/helpers";
import type { CommodityDetail } from "../types";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_DISPLAY_LABELS } from "@/lib/constants/countryDisplayLabels";
import { useRegisteredCountries } from "@/contexts/RegisteredCountriesContext";
import { isStateRegister } from "@/lib/constants/exchangeRegistry";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  formatCommodityPrice,
  getCommodityDisplayCurrency,
} from "@/lib/commodity-map/commodityPriceDisplay";
import { postImportBalance } from "@/lib/trade/postImportGap";
import { fundedCountryTradeTotals } from "@/lib/market/producerMarket/fundedCountryViewRules";
import type { CommodityMarketScope } from "../lib/marketScope";
import { useMemo } from "react";
import { atPriceCap } from "@/lib/market/overviewPreview";
import { priceCapBasisText } from "@/lib/market/priceCapBasis";
import { cappedGoodNote, cappedGoodTarget } from "@/lib/market/cappedGoodTarget";
import { useTranslations } from "next-intl";
import { WatchButton } from "@/components/sidebarWidgets/WatchButton";

interface HeroPanelProps {
  data: CommodityDetail;
  marketScope: CommodityMarketScope;
  activeCountry: CountryId | null;
  forexEnabled: boolean;
  exchangeRates: Partial<Record<CurrencyCode, number>>;
  onSelectExchange: (countryId: CountryId | null) => void;
}

export default function HeroPanel({
  data,
  marketScope,
  activeCountry,
  forexEnabled,
  exchangeRates,
  onSelectExchange,
}: HeroPanelProps) {
  const t = useTranslations("corporations.commodityMarket");
  const registered = useRegisteredCountries();
  // Exchange tabs follow the runtime registered set, filtered to countries that
  // actually run a market (exchangeName). A latent SCO/WAL surfaces here only once
  // activated and configured with an exchange. Command economies are excluded:
  // they carry an exchangeName so their state enterprises have a listing venue,
  // but a planning committee is not a commodity market — `exchangeName` alone
  // stopped meaning "runs a market" once state registers were introduced.
  const exchangeTabs = useMemo<{ countryId: CountryId; label: string }[]>(
    () =>
      registered
        .filter((id) => !!COUNTRY_DISPLAY_LABELS[id]?.exchangeName && !isStateRegister(id))
        .map((id) => ({
          countryId: id,
          label: (COUNTRY_DISPLAY_LABELS[id]?.exchangeName ?? id).toUpperCase(),
        })),
    [registered]
  );
  const capBasis = data.priceCapBasis;
  const atCap =
    !!capBasis &&
    atPriceCap({
      globalPrice: marketScope.marketPrice,
      priceCeiling: data.basePrice * capBasis.multiplier * capBasis.nominalIndex,
    });
  const capNote = atCap ? priceCapBasisText(capBasis) : null;
  const capTarget =
    atCap && !activeCountry
      ? cappedGoodTarget({
          basePrice: data.basePrice,
          globalPrice: data.globalPrice,
          globalSupply: data.globalSupply,
          globalDemand: data.globalDemand,
          priceAttribution: data.priceAttribution,
        })
      : null;
  const heroSlug = COMMODITY_HERO_SLUGS[data.commodity as CommodityType];
  const heroAlt = COMMODITY_HERO_ALTS[data.commodity as CommodityType] ?? data.label;
  const selectedCurrency = activeCountry ? getCommodityDisplayCurrency(activeCountry) : null;
  const priceDisplay = selectedCurrency
    ? formatCommodityPrice(marketScope.marketPrice, selectedCurrency, forexEnabled, exchangeRates)
    : formatCurrencyPrecise(marketScope.marketPrice);
  const basePriceDisplay = selectedCurrency
    ? formatCommodityPrice(data.basePrice, selectedCurrency, forexEnabled, exchangeRates)
    : formatCurrencyPrecise(data.basePrice);

  const priceBasisLabel = selectedCurrency
    ? t("priceBasisMarket", { market: marketScope.marketLabel, currency: selectedCurrency })
    : t("priceBasisWorld");

  // A funded country book carries trade both ways: show what local producers
  // actually sold. Without one, show the plain gap between offers and orders.
  // Never label a gap "surplus": exports and shipments to other states can
  // absorb it, which is what made an exporting country read as a glut.
  const funded = marketScope.fundedMarket;
  const trade = funded ? fundedCountryTradeTotals(funded) : null;
  const importsKnown = marketScope.imports !== null;
  const gap = importsKnown
    ? postImportBalance(marketScope.supply, marketScope.demand, marketScope.imports).balance
    : marketScope.balance;
  const soldShare =
    trade?.sold != null && funded && funded.supply > 0 ? trade.sold / funded.supply : null;

  return (
    <header className="relative overflow-hidden rounded-2xl border border-card-border bg-card shadow-lg mb-6">
      <div className="relative h-[160px] w-full sm:h-[200px]">
        <HeroImage
          src={`/api/images/hero/${heroSlug}`}
          alt={heroAlt}
          fill
          className="object-cover"
          style={{ objectPosition: "center 40%" }}
          priority
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
          aria-hidden
        />

        <div className="absolute inset-0 flex flex-col justify-between px-5 sm:px-6 py-4 sm:py-5">
          {/* Top row */}
          <div className="flex items-center justify-between gap-2">
            <BackButton
              iconOnly
              fallbackLabel="Back"
              fallbackHref="/country/us/stockmarket?tab=commodities"
            />
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={() => onSelectExchange(null)}
                className={`rounded-lg border px-3 py-1 text-xs font-bold transition-colors ${
                  activeCountry === null
                    ? "bg-white/20 border-white/40 text-white"
                    : "bg-black/50 border-white/10 text-white/80 hover:text-white"
                }`}
              >
                GLOBAL
              </button>
              {exchangeTabs.map(({ countryId, label }) => (
                <button
                  key={countryId}
                  onClick={() => onSelectExchange(countryId)}
                  className={`rounded-lg border px-3 py-1 text-xs font-bold transition-colors ${
                    activeCountry === countryId
                      ? "bg-white/20 border-white/40 text-white"
                      : "bg-black/50 border-white/10 text-white/80 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom row */}
          <div className="flex items-end gap-3">
            <span
              className={`inline-flex items-center justify-center w-11 h-11 rounded-xl border text-base font-bold shadow-md ${data.colors}`}
            >
              {data.icon}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-white/70 drop-shadow italic mb-0.5">
                Base: {basePriceDisplay}/{data.unit.replace(/s$/, "")}
              </p>
              <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-md sm:text-3xl">
                {data.label}
              </h1>
            </div>
            <div className="ml-auto">
              <WatchButton kind="commodity" id={data.commodity} tone="image" />
            </div>
          </div>
        </div>
      </div>
      {/* Stats strip */}
      <div className="flex items-center overflow-x-auto divide-x divide-card-border border-t border-card-border">
        <div className="flex flex-1 flex-col px-5 py-3 min-w-max">
          <span className="text-body-sm font-medium text-muted">{priceBasisLabel}</span>
          <span className="text-base font-bold tabular-nums">{priceDisplay}</span>
          <span
            className={`text-xs tabular-nums ${
              marketScope.priceChange > 0
                ? "text-error"
                : marketScope.priceChange < 0
                  ? "text-success"
                  : "text-muted"
            }`}
          >
            {marketScope.priceChange > 0 ? "+" : ""}
            {marketScope.priceChange}% vs original base
          </span>
          {capNote && <span className="text-[10px] text-muted">At cap: {capNote}</span>}
          {capTarget && (
            <span className="text-[10px] text-muted">At cap: {cappedGoodNote(capTarget)}</span>
          )}
          <span className="mt-1 text-[10px] text-muted">{marketScope.marketCaption}</span>
        </div>
        <div className="flex flex-1 flex-col px-5 py-3 min-w-max">
          <span className="text-body-sm font-medium text-muted">
            {activeCountry ? "Regions" : "Rolling 1Y"}
          </span>
          {activeCountry ? (
            <>
              <span className="text-base font-bold tabular-nums text-foreground">
                {marketScope.regionCount}
              </span>
              <span className="text-xs text-muted">
                {COUNTRY_DISPLAY_LABELS[activeCountry].regionLabelPlural}
              </span>
            </>
          ) : (
            <>
              <span
                className={`text-base font-bold tabular-nums ${
                  data.annualPriceChange > 0
                    ? "text-success"
                    : data.annualPriceChange < 0
                      ? "text-error"
                      : "text-muted"
                }`}
              >
                {data.annualPriceChange > 0 ? "+" : ""}
                {data.annualPriceChange.toFixed(2)}%
              </span>
              <span className="text-xs text-muted">48-turn annualized</span>
            </>
          )}
        </div>
        <div className="flex flex-1 flex-col px-5 py-3 min-w-max">
          <span className="text-body-sm font-medium text-muted">
            {activeCountry ? "National supply" : "Global supply"}
          </span>
          <span className="text-base font-bold tabular-nums text-success">
            {formatUnits(marketScope.supply, data.unit)}
          </span>
          <span className="text-xs text-muted">{t("supplyOfferedPerDay")}</span>
          <span className="text-[10px] text-muted" title={t("supplyOfferedExplanation")}>
            {t("supplyIncludesStock")}
          </span>
          {funded && funded.imports > 0 ? (
            <span className="text-[10px] text-muted">
              plus {formatUnits(funded.imports, data.unit)} imported
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col px-5 py-3 min-w-max">
          <span className="text-body-sm font-medium text-muted">
            {activeCountry ? "National demand" : "Global demand"}
          </span>
          <span className="text-base font-bold tabular-nums text-error">
            {formatUnits(marketScope.demand, data.unit)}
          </span>
          <span className="text-xs text-muted">
            {marketScope.demandBasis === "funded_orders" ? "ordered per day" : "per day"}
          </span>
          {funded && funded.exports > 0 ? (
            <span className="text-[10px] text-muted">
              plus {formatUnits(funded.exports, data.unit)} exported
            </span>
          ) : null}
          {marketScope.filled !== null ? (
            <span className="text-[10px] text-muted">
              {formatUnits(marketScope.filled, data.unit)} received
            </span>
          ) : null}
          {marketScope.spilloverRequested > 0 ? (
            <span className="text-[10px] text-muted" title={t("substitutionOrdersExplanation")}>
              {t("substitutionOrders", {
                units: formatUnits(marketScope.spilloverRequested, data.unit),
              })}
            </span>
          ) : null}
        </div>
        {trade?.sold != null && soldShare != null ? (
          <div className="flex flex-1 flex-col px-5 py-3 min-w-max" data-testid="hero-sold">
            <span className="text-body-sm font-medium text-muted">Local producers sold</span>
            <span className="text-base font-bold tabular-nums text-foreground">
              {formatUnits(trade.sold, data.unit)}
            </span>
            <span className="text-xs text-muted">
              {Math.round(soldShare * 100)}% of offers, at home and abroad
            </span>
          </div>
        ) : (
          <div className="flex flex-1 flex-col px-5 py-3 min-w-max" data-testid="hero-gap">
            <span className="text-body-sm font-medium text-muted">Offers vs orders</span>
            <span className="text-base font-bold tabular-nums text-foreground">
              {gap === 0 ? "Even" : formatUnits(Math.abs(gap), data.unit)}
            </span>
            <span className="text-xs text-muted">
              {gap > 0
                ? importsKnown
                  ? "more offered, counting imports"
                  : "more offered than ordered"
                : gap < 0
                  ? importsKnown
                    ? "more ordered, counting imports"
                    : "more ordered than offered"
                  : "offers matched orders"}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
