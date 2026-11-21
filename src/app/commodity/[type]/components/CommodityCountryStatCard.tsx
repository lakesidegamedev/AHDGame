"use client";

import { useEffect, useRef } from "react";
import type { CountryCommodityData } from "@/lib/commodity-map/commodityAggregation";
import { COUNTRIES_WITH_REGION_MAPS } from "@/lib/commodity-map/commodityRegionMappings";
import { type CountryId } from "@/lib/constants/countriesCore";
import { COUNTRY_CLIENT_CONFIGS } from "@/lib/constants/countryClientConfig";
import { CountryFlag } from "@/components/CountryFlag";
import type { CurrencyCode } from "@/lib/constants/currencies";
import {
  formatCommodityPrice,
  getCommodityDisplayCurrency,
} from "@/lib/commodity-map/commodityPriceDisplay";
import type { MapMode } from "./CommodityMapModeToggle";
import { formatUnits } from "../lib/helpers";
import {
  countryBuildOutlook,
  fundedCountryTradeTotals,
  type FundedCountryMarket,
} from "@/lib/market/producerMarket/fundedCountryViewRules";

const BUILD_OUTLOOK_COPY = {
  "unfilled-orders":
    "Worth scouting states where buyers could pay but didn’t get their orders filled.",
  mixed: "Build selectively. Some buyers went unserved while local offers went unsold.",
  "unsold-offers": "Be cautious about adding supply. Local producers had unsold offers.",
  "strong-sales": "Most local offers sold. Look for a state with unmet demand before building.",
  unknown: "Check the local market before building. Country-wide sales data is limited.",
} satisfies Record<ReturnType<typeof countryBuildOutlook>, string>;

interface CommodityCountryStatCardProps {
  countryId: CountryId;
  commodityLabel: string;
  unit: string;
  data: CountryCommodityData;
  market?: FundedCountryMarket;
  mode: MapMode;
  onModeChange: (mode: MapMode) => void;
  forexEnabled: boolean;
  exchangeRates: Partial<Record<CurrencyCode, number>>;
  position?: { x: number; y: number };
  onClose: () => void;
  onViewCountryPage: () => void;
  onViewCountryMap: () => void;
}

export default function CommodityCountryStatCard({
  countryId,
  commodityLabel,
  unit,
  data,
  market,
  mode,
  onModeChange,
  forexEnabled,
  exchangeRates,
  position,
  onClose,
  onViewCountryPage,
  onViewCountryMap,
}: CommodityCountryStatCardProps) {
  const desktopRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const config = COUNTRY_CLIENT_CONFIGS[countryId];
  const currencyCode = getCommodityDisplayCurrency(countryId);
  const hasRegionMap = COUNTRIES_WITH_REGION_MAPS.has(countryId);
  // Close on click outside — check both desktop overlay and mobile sheet refs
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const inDesktop = desktopRef.current?.contains(e.target as Node);
      const inMobile = mobileRef.current?.contains(e.target as Node);
      if (!inDesktop && !inMobile) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Prevent card clicks from bubbling to the document handler
  const handleCardInteraction = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Desktop: anchored overlay near click position
  // Mobile: bottom sheet
  return (
    <>
      {/* Desktop overlay card */}
      <div
        ref={desktopRef}
        className="hidden md:block absolute z-30 w-80 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        style={
          position
            ? {
                left: Math.min(position.x + 16, window.innerWidth - 336),
                top: Math.max(position.y - 60, 16),
              }
            : { right: 16, top: 60 }
        }
        onMouseDown={handleCardInteraction}
        onClick={handleCardInteraction}
      >
        <CardContent
          config={config}
          countryId={countryId}
          commodityLabel={commodityLabel}
          unit={unit}
          data={data}
          mode={mode}
          market={market}
          hasRegionMap={hasRegionMap}
          currencyCode={currencyCode}
          forexEnabled={forexEnabled}
          exchangeRates={exchangeRates}
          onModeChange={onModeChange}
          onClose={onClose}
          onViewCountryPage={onViewCountryPage}
          onViewCountryMap={onViewCountryMap}
        />
      </div>

      {/* Mobile bottom sheet */}
      <div className="md:hidden fixed inset-0 z-50 flex items-end">
        {/* Backdrop */}
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Close dialog"
        />
        {/* Sheet */}
        <div
          ref={mobileRef}
          className="relative w-full animate-in slide-in-from-bottom duration-300 ease-out"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1 bg-card rounded-t-2xl">
            <div className="w-10 h-1 rounded-full bg-card-border" />
          </div>
          <div className="bg-card px-4 pb-6 rounded-t-2xl -mt-1">
            <CardContent
              config={config}
              countryId={countryId}
              commodityLabel={commodityLabel}
              unit={unit}
              data={data}
              mode={mode}
              market={market}
              hasRegionMap={hasRegionMap}
              currencyCode={currencyCode}
              forexEnabled={forexEnabled}
              exchangeRates={exchangeRates}
              onModeChange={onModeChange}
              onClose={onClose}
              onViewCountryPage={onViewCountryPage}
              onViewCountryMap={onViewCountryMap}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function CardContent({
  config,
  countryId: _countryId,
  commodityLabel,
  unit,
  data,
  mode,
  market,
  hasRegionMap,
  currencyCode,
  forexEnabled,
  exchangeRates,
  onModeChange,
  onClose,
  onViewCountryPage,
  onViewCountryMap,
}: {
  config: (typeof COUNTRY_CLIENT_CONFIGS)[CountryId];
  countryId: CountryId;
  commodityLabel: string;
  unit: string;
  data: CountryCommodityData;
  mode: MapMode;
  market?: FundedCountryMarket;
  hasRegionMap: boolean;
  currencyCode: CurrencyCode;
  forexEnabled: boolean;
  exchangeRates: Partial<Record<CurrencyCode, number>>;
  onModeChange: (mode: MapMode) => void;
  onClose: () => void;
  onViewCountryPage: () => void;
  onViewCountryMap: () => void;
}) {
  const trade = market ? fundedCountryTradeTotals(market) : null;
  const sold = trade?.sold ?? null;
  const percentSold =
    market && market.supply > 0 && sold !== null
      ? `${((100 * sold) / market.supply).toFixed(0)}% of local offers sold`
      : undefined;
  const activePrice = data.avgPrice ?? null;

  return (
    <div className="rounded-xl border border-card-border bg-card shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-card-elevated/50 border-b border-card-border">
        <div className="flex items-center gap-2">
          <CountryFlag country={_countryId} size="md" />
          <div>
            <h3 className="text-sm font-bold text-foreground">{config.name}</h3>
            <p className="text-[10px] text-muted">{commodityLabel}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-card-elevated text-muted hover:text-foreground transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 pt-3">
        <TradeTotal
          label={trade ? "Total supply" : "Estimated local supply"}
          value={`${formatUnits(trade?.supply ?? data.supply, unit)}/day`}
          tone="supply"
          parts={
            market && [
              { label: "Local offers", value: formatUnits(market.supply, unit) },
              { label: "Imports", value: formatUnits(market.imports, unit) },
            ]
          }
        />
        <TradeTotal
          label={trade ? "Total demand" : "Estimated domestic demand"}
          value={`${formatUnits(trade?.demand ?? data.demand, unit)}/day`}
          tone="demand"
          parts={
            market && [
              { label: "Local orders", value: formatUnits(market.demand, unit) },
              { label: "Exports", value: formatUnits(market.exports, unit) },
            ]
          }
        />
      </div>

      <div className="grid grid-cols-2">
        {activePrice != null && (
          <StatRow
            label={mode === "price" ? "National price" : "Avg price"}
            value={formatCommodityPrice(activePrice, currencyCode, forexEnabled, exchangeRates)}
            color="text-foreground"
          />
        )}
        <StatRow
          label="Local producer sales"
          value={sold !== null ? `${formatUnits(sold, unit)}/day` : "Unavailable"}
          color={sold !== null ? "text-success" : "text-muted"}
          sub={percentSold}
        />
      </div>

      <p className="mx-3 mb-3 rounded-lg border border-card-border bg-card-elevated/50 px-3 py-2 text-xs leading-relaxed text-muted">
        <strong className="font-semibold text-foreground">Thinking of building?</strong>{" "}
        {BUILD_OUTLOOK_COPY[countryBuildOutlook(market)]}
      </p>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-card-border space-y-2">
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onModeChange("supply");
            }}
            className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              mode === "supply"
                ? "bg-success text-white"
                : "bg-card-elevated text-muted hover:text-foreground"
            }`}
          >
            Supply
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onModeChange("demand");
            }}
            className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              mode === "demand"
                ? "bg-error text-white"
                : "bg-card-elevated text-muted hover:text-foreground"
            }`}
          >
            Demand
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onModeChange("price");
            }}
            className={`flex-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              mode === "price"
                ? "bg-primary text-white"
                : "bg-card-elevated text-muted hover:text-foreground"
            }`}
          >
            Price
          </button>
        </div>
        {hasRegionMap ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewCountryMap();
              }}
              className="w-full px-3 py-2.5 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
            >
              View national map
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewCountryPage();
              }}
              className="w-full text-center text-xs text-muted hover:text-foreground transition-colors py-0.5"
            >
              View country page →
            </button>
          </>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewCountryPage();
            }}
            className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-card-border bg-card hover:bg-card-elevated transition-colors text-foreground"
          >
            View country page
          </button>
        )}
      </div>

      {/* Region count hint */}
      <div className="px-4 pb-2 text-[10px] text-muted">
        {data.stateCount} {data.stateCount === 1 ? "region" : "regions"} with commodity data
      </div>
    </div>
  );
}

function TradeTotal({
  label,
  value,
  tone,
  parts,
}: {
  label: string;
  value: string;
  tone: "supply" | "demand";
  parts?: { label: string; value: string }[];
}) {
  const accent =
    tone === "supply"
      ? "border-success/35 bg-success/5 text-success"
      : "border-info/35 bg-info/5 text-info";
  return (
    <div className={`rounded-lg border px-2.5 py-2.5 ${accent}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{value}</div>
      {parts && (
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-1 gap-y-1 border-t border-card-border pt-1.5 text-[11px] leading-tight">
          {parts.map((part) => (
            <div key={part.label} className="contents">
              <dt className="text-muted">{part.label}</dt>
              <dd className="text-right tabular-nums text-foreground">{part.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="px-4 py-2 bg-card">
      <div className="text-body-sm font-medium text-muted">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}
