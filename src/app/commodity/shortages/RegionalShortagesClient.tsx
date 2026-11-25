"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import { getNationalCommodityBalance } from "@/lib/commodity-map/nationalBalances";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { CommodityData } from "@/app/country/[code]/stockmarket/types";

const EMPTY_STATE_COUNTRY_MAP: ReadonlyMap<string, string> = new Map();

interface ScopeMeta {
  countryIds: string[];
  statesByCountry: Record<string, string[]>;
}

interface ShortageRow {
  commodity: string;
  label: string;
  unit: string;
  supply: number;
  demand: number;
  gap: number;
  price: number;
  basePrice: number;
  vsBasePct: number | null;
}

export function computeRegionalShortages(
  commodities: CommodityData[],
  countryId: string,
  stateId: string,
  showAll = false,
  stateCountryMap = EMPTY_STATE_COUNTRY_MAP
): ShortageRow[] {
  const rows: ShortageRow[] = [];
  for (const c of commodities) {
    const useState = stateId !== "all";
    const stateSupply = c.stateSupply ?? {};
    const stateDemand = c.stateDemand ?? {};
    const { supply, demand } = useState
      ? { supply: stateSupply[stateId] ?? 0, demand: stateDemand[stateId] ?? 0 }
      : getNationalCommodityBalance(
          { ...c, stateSupply, stateDemand },
          countryId,
          c.nationalBalanceSource === "funded_book" ? EMPTY_STATE_COUNTRY_MAP : stateCountryMap
        );
    const gap = demand - supply;
    if (!showAll && gap <= 0) continue;

    const price = useState
      ? (c.statePrices?.[stateId] ?? c.nationalPrices?.[countryId] ?? c.globalPrice)
      : (c.nationalPrices?.[countryId] ?? c.globalPrice);
    const vsBasePct = c.basePrice > 0 ? ((price - c.basePrice) / c.basePrice) * 100 : null;

    rows.push({
      commodity: c.commodity,
      label: c.label,
      unit: c.unit,
      supply,
      demand,
      gap,
      price,
      basePrice: c.basePrice,
      vsBasePct,
    });
  }

  return rows.sort((a, b) => (showAll ? a.label.localeCompare(b.label) : b.gap - a.gap));
}

export default function RegionalShortagesClient({
  initialCountry,
  initialShowAll = false,
}: {
  initialCountry?: string;
  initialShowAll?: boolean;
}) {
  const { formatPrice } = useCurrency();
  const countryName = useCountryDisplayName();
  const [commodities, setCommodities] = useState<CommodityData[]>([]);
  const [scopeMeta, setScopeMeta] = useState<ScopeMeta | null>(null);
  const [countryId, setCountryId] = useState<string>("");
  const [stateId, setStateId] = useState<string>("all");
  const [showAll, setShowAll] = useState(initialShowAll);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/commodities?scope=full")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load regional commodity data");
        return res.json();
      })
      .then((data: { commodities?: CommodityData[]; scopeMeta?: ScopeMeta }) => {
        if (cancelled) return;
        const list = data.commodities ?? [];
        const meta = data.scopeMeta ?? null;
        setCommodities(list);
        setScopeMeta(meta);
        if (meta && meta.countryIds.length > 0) {
          setCountryId(
            initialCountry && meta.countryIds.includes(initialCountry)
              ? initialCountry
              : meta.countryIds[0]
          );
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load regional commodity data");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialCountry]);

  const countries = scopeMeta?.countryIds ?? [];
  const states = useMemo(
    () => (countryId ? (scopeMeta?.statesByCountry?.[countryId] ?? []) : []),
    [countryId, scopeMeta]
  );

  const rows = useMemo(() => {
    const stateCountryMap = new Map(states.map((id) => [id, countryId]));
    return countryId
      ? computeRegionalShortages(commodities, countryId, stateId, showAll, stateCountryMap)
      : [];
  }, [commodities, countryId, stateId, showAll, states]);
  const title = showAll ? "Regional commodity demand" : "Regional commodity shortages";

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <nav
              className="mb-1 flex items-center gap-1.5 text-body text-muted"
              aria-label="Breadcrumb"
            >
              <Link
                href="/country/us/stockmarket?tab=commodities"
                className="transition-colors hover:text-foreground"
              >
                Commodities
              </Link>
              <span aria-hidden>/</span>
              <span className="font-medium text-foreground">
                {showAll ? "Regional demand" : "Regional shortages"}
              </span>
            </nav>
            <h1 className="text-heading font-bold text-foreground">{title}</h1>
            <p className="mt-1 text-body text-muted">
              {showAll
                ? "Supply and demand for every commodity in the chosen country or state."
                : "Every commodity where demand exceeds local supply in the chosen country or state."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-card-border bg-card p-4 shadow-card">
          <label className="flex items-center gap-2 text-body-sm text-muted">
            <span>Country</span>
            <select
              aria-label="Country"
              value={countryId}
              onChange={(e) => {
                setCountryId(e.target.value);
                setStateId("all");
              }}
              className="h-8 rounded-md border border-card-border bg-background px-2 text-body text-foreground focus:border-foreground focus:outline-none"
            >
              {countries.map((code) => (
                <option key={code} value={code}>
                  {countryName(code as CountryId)} ({code})
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-body-sm text-muted">
            <span>State / Region</span>
            <select
              aria-label="State or region"
              value={stateId}
              onChange={(e) => setStateId(e.target.value)}
              disabled={states.length === 0}
              className="h-8 rounded-md border border-card-border bg-background px-2 text-body text-foreground focus:border-foreground focus:outline-none disabled:opacity-50"
            >
              <option value="all">All states (national)</option>
              {states.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-body-sm text-muted">
            <span>Show</span>
            <select
              value={showAll ? "all" : "shortages"}
              onChange={(e) => setShowAll(e.target.value === "all")}
              className="h-8 rounded-md border border-card-border bg-background px-2 text-body text-foreground focus:border-foreground focus:outline-none"
            >
              <option value="all">All commodities</option>
              <option value="shortages">Shortages only</option>
            </select>
          </label>

          {!loading && !error && (
            <span className="ml-auto text-body-sm text-muted">
              {rows.length} {rows.length === 1 ? "commodity" : "commodities"}
              {!showAll && " short"}
            </span>
          )}
        </div>

        {loading && (
          <div className="rounded-xl border border-card-border bg-card p-8 text-center text-body text-muted">
            Loading regional commodity data…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-4 text-body text-error">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-xl border border-card-border bg-card p-8 text-center text-body text-muted">
            {showAll
              ? "Commodity data is unavailable for this market."
              : "No commodities are short in this market right now."}
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
            <table className="w-full min-w-[600px] text-body">
              <thead>
                <tr className="border-b border-card-border text-left text-body-sm text-muted">
                  <th className="px-4 py-2.5 font-medium">Commodity</th>
                  <th className="px-4 py-2.5 text-right font-medium">Supply</th>
                  <th className="px-4 py-2.5 text-right font-medium">Demand</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {showAll ? "Balance" : "Shortage gap"}
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">vs base</th>
                  <th className="px-4 py-2.5 text-right font-medium">Market</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.commodity}
                    className="border-b border-card-border/50 last:border-b-0 hover:bg-card-elevated/40"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {Math.round(row.supply).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {Math.round(row.demand).toLocaleString()} {row.unit}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-semibold tabular-nums ${
                        row.gap > 0 ? "text-error" : row.gap < 0 ? "text-success" : "text-muted"
                      }`}
                    >
                      {row.gap < 0 ? "+" : ""}
                      {Math.round(-row.gap).toLocaleString()} {row.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                      {formatPrice(row.price)}
                      <span className="text-body-sm text-muted"> /{row.unit}</span>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        row.vsBasePct != null && row.vsBasePct > 0
                          ? "text-error"
                          : row.vsBasePct != null && row.vsBasePct < 0
                            ? "text-success"
                            : "text-muted"
                      }`}
                    >
                      {row.vsBasePct == null
                        ? "—"
                        : `${row.vsBasePct > 0 ? "+" : ""}${row.vsBasePct.toFixed(0)}%`}
                    </td>
                    <td className="px-4 py-2.5 text-right text-body-sm">
                      <Link
                        href={`/commodity/${row.commodity}`}
                        className="text-primary hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
