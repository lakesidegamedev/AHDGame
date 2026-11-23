"use client";

import { useTranslations } from "next-intl";
import type { SupplyAgreementPriceMode } from "@/lib/db/types/supplyAgreement";
import {
  fixedPriceBounds,
  newModeSides,
  SUPPLY_AGREEMENT_FIXED_PRICE_BAND,
  SUPPLY_AGREEMENT_INDEXED_BAND,
} from "@/lib/corporations/supplyExchange/rules/contractPricing";

export interface ContractPriceValue {
  priceMode: SupplyAgreementPriceMode;
  /** Percent, for market price plus or minus. */
  percent: number;
  /** Per-unit price, for a set price. Empty until chosen. */
  fixedPrice: string;
}

const FIXED_PCT = Math.round(SUPPLY_AGREEMENT_FIXED_PRICE_BAND * 100);
const INDEXED_PCT = Math.round(SUPPLY_AGREEMENT_INDEXED_BAND * 100);

/** Default draft for a commodity: a set price at today's market, or the percentage mode with no market. */
export function defaultPriceValue(marketPrice: number | undefined): ContractPriceValue {
  return {
    priceMode: marketPrice && marketPrice > 0 ? "fixed" : "indexed",
    percent: 0,
    fixedPrice: marketPrice && marketPrice > 0 ? marketPrice.toFixed(2) : "",
  };
}

/** Request fields for the chosen price option. */
export function priceRequestFields(value: ContractPriceValue) {
  return value.priceMode === "fixed"
    ? { priceMode: "fixed" as const, fixedUnitPrice: Number(value.fixedPrice) }
    : { priceMode: "indexed" as const, pricePremium: value.percent / 100 };
}

/**
 * Price option, slider and the two-sided lines for a new or countered offer.
 * `marketPrice` is the published price now, `billedPrice` the buyer's input bill.
 */
export function ContractPriceFields(props: {
  value: ContractPriceValue;
  onChange: (next: ContractPriceValue) => void;
  marketPrice: number | undefined;
  billedPrice: number | undefined;
  unit: string;
  formatPrice: (value: number) => string;
}) {
  const t = useTranslations("corporations.supplyAgreements.priceModes");
  const { value, onChange, marketPrice, billedPrice, unit, formatPrice } = props;
  const hasMarket = typeof marketPrice === "number" && marketPrice > 0;
  const bounds = hasMarket ? fixedPriceBounds(marketPrice) : null;
  const fixedPrice = Number(value.fixedPrice);
  const market = hasMarket ? marketPrice : 0;
  const percent = value.percent / 100;
  const sides =
    hasMarket && typeof billedPrice === "number"
      ? newModeSides({
          priceMode: value.priceMode,
          fixedUnitPrice: Number.isFinite(fixedPrice) ? fixedPrice : market,
          pricePremium: percent,
          marketUnitPrice: market,
          billedUnitPrice: billedPrice,
        })
      : null;
  const options: SupplyAgreementPriceMode[] = ["fixed", "indexed"];
  return (
    <div className="space-y-2" data-testid="contract-price-fields">
      <div className="text-xs font-semibold text-foreground">{t("title")}</div>
      <div className="flex gap-2" role="radiogroup" aria-label={t("modeLabel")}>
        {options.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={value.priceMode === mode}
            disabled={mode === "fixed" && !hasMarket}
            onClick={() => onChange({ ...value, priceMode: mode })}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              value.priceMode === mode
                ? "border-primary bg-primary text-white"
                : "border-card-border text-muted hover:text-foreground"
            } disabled:opacity-50`}
          >
            {t(mode)}
          </button>
        ))}
      </div>
      {value.priceMode === "fixed" ? (
        bounds ? (
          <div className="space-y-1">
            <label className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span>{t("fixedLabel", { unit })}</span>
              <span className="tabular-nums text-primary">
                {Number.isFinite(fixedPrice) ? formatPrice(fixedPrice) : ""}
              </span>
            </label>
            <input
              type="range"
              aria-label={t("fixedLabel", { unit })}
              min={bounds.min}
              max={bounds.max}
              step={0.01}
              value={Number.isFinite(fixedPrice) ? fixedPrice : market}
              onChange={(e) => onChange({ ...value, fixedPrice: e.target.value })}
              className="w-full accent-primary"
            />
            <p className="text-[11px] text-muted">
              {t("fixedHelp", {
                band: FIXED_PCT,
                low: formatPrice(bounds.min),
                high: formatPrice(bounds.max),
                market: formatPrice(market),
                unit,
              })}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-muted">{t("noMarket")}</p>
        )
      ) : (
        <div className="space-y-1">
          <label className="flex items-center justify-between text-xs font-semibold text-foreground">
            <span>{t("indexedLabel")}</span>
            <span className="tabular-nums text-primary">
              {value.percent > 0 ? "+" : value.percent < 0 ? "−" : ""}
              {Math.abs(value.percent)}%
            </span>
          </label>
          <input
            type="range"
            aria-label={t("indexedLabel")}
            min={-INDEXED_PCT}
            max={INDEXED_PCT}
            step={1}
            value={value.percent}
            onChange={(e) => onChange({ ...value, percent: Number(e.target.value) })}
            className="w-full accent-primary"
          />
          <p className="text-[11px] text-muted">{t("indexedHelp", { band: INDEXED_PCT })}</p>
        </div>
      )}
      {sides && (
        <ul className="space-y-0.5 rounded-lg border border-card-border bg-card-elevated p-2 text-[11px] text-muted">
          <li data-testid="contract-seller-side">
            {value.priceMode === "fixed"
              ? t("sellerFixed", { price: formatPrice(sides.sellerUnitPrice), unit })
              : t("sellerIndexed", {
                  percent: `${value.percent > 0 ? "+" : value.percent < 0 ? "−" : ""}${Math.abs(value.percent)}%`,
                  price: formatPrice(sides.sellerUnitPrice),
                  unit,
                })}
          </li>
          <li data-testid="contract-buyer-side">
            {t("buyerNet", {
              bill: formatPrice(sides.buyerBillUnitPrice),
              transfer: formatPrice(sides.transferPerUnit),
              net: formatPrice(sides.buyerNetUnitPrice),
              unit,
            })}
          </li>
          <li>{t("settlesDifference")}</li>
        </ul>
      )}
    </div>
  );
}
