"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { CommodityData } from "@/app/country/[code]/stockmarket/types";

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
  stateId: string
): ShortageRow[] {
  const rows: ShortageRow[] = [];
  for (const c of commodities) {
    const useState = stateId !== "all";
    const supply = useState
      ? (c.stateSupply?.[stateId] ?? 0)
      : (c.nationalSupply?.[countryId] ?? 0);
    const demand = useState
      ? (c.stateDemand?.[stateId] ?? 0)
      : (c.nationalDemand?.[countryId] ?? 0);
    const gap = demand - supply;
    if (gap <= 0) continue;

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

  return rows.sort((a, b) => b.gap - a.gap);
}

export default function RegionalShortagesClient() {
  const { formatPrice } = useCurrency();
  const countryName = useCountryDisplayName();
  const [commodities, setCommodities] = useState<CommodityData[]>([]);
  const [scopeMeta, setScopeMeta] = useState<ScopeMeta | null>(null);
  const [countryId, setCountryId] = useState<string>("");
  const [stateId, setStateId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/commodities?scope=full")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load commodity shortages");
        return res.json();
      })
      .then((data: { commodities?: CommodityData[]; scopeMeta?: ScopeMeta }) => {
        if (cancelled) return;
        const list = data.commodities ?? [];
        const meta = data.scopeMeta ?? null;
        setCommodities(list);
        setScopeMeta(meta);
        if (meta && meta.countryIds.length > 0) {
          setCountryId((prev) => prev || meta.countryIds[0]);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load commodity shortages");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const countries = scopeMeta?.countryIds ?? [];
  const states = useMemo(
    () => (countryId ? (scopeMeta?.statesByCountry?.[countryId] ?? []) : []),
    [countryId, scopeMeta]
  );

  const shortages = useMemo(
    () => (countryId ? computeRegionalShortages(commodities, countryId, stateId) : []),
    [commodities, countryId, stateId]
  );

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <nav
              className="mb-1 flex items-center gap-1.5 text-sm text-muted"
              aria-label="Breadcrumb"
            >
              <Link
                href="/country/us/stockmarket?tab=commodities"
                className="transition-colors hover:text-foreground"
              >
                Commodities
              </Link>
              <span aria-hidden>/</span>
              <span className="font-medium text-foreground">Regional shortages</span>
            </nav>
            <h1 className="text-2xl font-bold text-foreground">Regional commodity shortages</h1>
            <p className="mt-1 text-sm text-muted">
              Every commodity where demand exceeds local supply in the chosen country or state.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-card-border bg-card p-4 shadow-card">
          <label className="flex items-center gap-2 text-xs text-muted">
            <span>Country</span>
            <select
              aria-label="Country"
              value={countryId}
              onChange={(e) => {
                setCountryId(e.target.value);
                setStateId("all");
              }}
              className="h-8 rounded-md border border-card-border bg-background px-2 text-sm text-foreground focus:border-foreground focus:outline-none"
            >
              {countries.map((code) => (
                <option key={code} value={code}>
                  {countryName(code as CountryId)} ({code})
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-muted">
            <span>State / Region</span>
            <select
              aria-label="State or region"
              value={stateId}
              onChange={(e) => setStateId(e.target.value)}
              disabled={states.length === 0}
              className="h-8 rounded-md border border-card-border bg-background px-2 text-sm text-foreground focus:border-foreground focus:outline-none disabled:opacity-50"
            >
              <option value="all">All states (national)</option>
              {states.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>

          {!loading && !error && (
            <span className="ml-auto text-xs text-muted">
              {shortages.length} {shortages.length === 1 ? "commodity" : "commodities"} short
            </span>
          )}
        </div>

        {loading && (
          <div className="rounded-xl border border-card-border bg-card p-8 text-center text-sm text-muted">
            Loading regional shortages…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error">
            {error}
          </div>
        )}

        {!loading && !error && shortages.length === 0 && (
          <div className="rounded-xl border border-card-border bg-card p-8 text-center text-sm text-muted">
            No commodities are short in this market right now.
          </div>
        )}

        {!loading && !error && shortages.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-card-border bg-card shadow-card">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-card-border text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Commodity</th>
                  <th className="px-4 py-2.5 text-right font-medium">Supply</th>
                  <th className="px-4 py-2.5 text-right font-medium">Demand</th>
                  <th className="px-4 py-2.5 text-right font-medium">Shortage gap</th>
                  <th className="px-4 py-2.5 text-right font-medium">Price</th>
                  <th className="px-4 py-2.5 text-right font-medium">vs base</th>
                  <th className="px-4 py-2.5 text-right font-medium">Market</th>
                </tr>
              </thead>
              <tbody>
                {shortages.map((row) => (
                  <tr
                    key={row.commodity}
                    className="border-b border-card-border/50 last:border-b-0 hover:bg-card-elevated/40"
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {Math.round(row.supply).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {Math.round(row.demand).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-error">
                      -{Math.round(row.gap).toLocaleString()} {row.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                      {formatPrice(row.price)}
                      <span className="text-xs text-muted"> /{row.unit}</span>
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
                    <td className="px-4 py-2.5 text-right text-xs">
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
