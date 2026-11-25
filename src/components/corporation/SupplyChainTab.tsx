"use client";

import { useEffect, useMemo, useState } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useCountryDisplayName } from "@/contexts/RegisteredCountriesContext";
import type { CountryId } from "@/lib/constants/countriesCore";
import { CORPORATION_TYPE_LABELS } from "@/lib/constants/corporationsClient";
import { useGameEvents } from "@/hooks/useGameEvents";
import { supplyChainRows } from "@/lib/corporations/supplyChain/rules/view";
import type {
  SupplyChainData,
  SupplyChainFilters,
  SupplyChainParty,
  SupplyChainRow,
} from "@/lib/corporations/supplyChain/types";
import { SupplyChainTable } from "./supplyChain/SupplyChainTable";
import { pillClass } from "@/components/ui/selectedState";

const initialFilters: SupplyChainFilters = {
  country: "",
  state: "",
  type: "",
  sector: "",
  mode: "",
  view: "company",
};
export const supplyLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const sectorLabel = (value: string) =>
  CORPORATION_TYPE_LABELS[value as keyof typeof CORPORATION_TYPE_LABELS] ?? supplyLabel(value);

export default function SupplyChainTab({
  corpId,
  modViewEnabled = false,
}: {
  corpId: string;
  modViewEnabled?: boolean;
}) {
  const [load, setLoad] = useState<{
    data: SupplyChainData | null;
    error: string;
    loading: boolean;
  }>({ data: null, error: "", loading: true });
  const [filters, setFilters] = useState(initialFilters);
  const [revision, setRevision] = useState(0);
  const { formatAmount } = useCurrency();
  const countryName = useCountryDisplayName();
  useGameEvents(() => setRevision((v) => v + 1), ["turn_complete"]);
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ data: null, error: "", loading: true });
    fetch(
      `/api/corporations/${encodeURIComponent(corpId)}/supply-chain${modViewEnabled ? "?modView=1" : ""}`,
      { cache: "no-store", signal: controller.signal }
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            typeof body.error === "string" ? body.error : "Could not load the supply chain."
          );
        if (!controller.signal.aborted) setLoad({ data: body, error: "", loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoad({
            data: null,
            error: error instanceof Error ? error.message : "Could not load the supply chain.",
            loading: false,
          });
      });
    return () => controller.abort();
  }, [corpId, modViewEnabled, revision]);
  useEffect(() => setFilters(initialFilters), [corpId]);
  const data = load.data;
  const sites = data?.sites ?? [];
  const countries = [...new Set(sites.map((s) => s.countryId))].filter(Boolean).sort();
  const stateIds = [
    ...new Set(
      sites.filter((s) => !filters.country || s.countryId === filters.country).map((s) => s.stateId)
    ),
  ]
    .filter(Boolean)
    .sort();
  const types = [
    ...new Set(
      sites
        .filter(
          (s) =>
            (!filters.country || s.countryId === filters.country) &&
            (!filters.state || s.stateId === filters.state)
        )
        .map((s) => s.sectorType)
    ),
  ].sort();
  const matchingSites = sites.filter(
    (s) =>
      (!filters.country || s.countryId === filters.country) &&
      (!filters.state || s.stateId === filters.state) &&
      (!filters.type || s.sectorType === filters.type)
  );
  const rows = useMemo(() => supplyChainRows(data?.flows ?? [], filters), [data, filters]);
  const parties = useMemo(
    () => new Map<string, SupplyChainParty>((data?.parties ?? []).map((p) => [p.id, p])),
    [data]
  );
  const totals = (direction: SupplyChainRow["direction"]) =>
    rows
      .filter((r) => r.direction === direction && r.mode !== "internal")
      .reduce((sum, r) => sum + r.amount, 0);
  const location = (country: string, state: string) =>
    [state ? (data?.states[state] ?? state) : "", country ? countryName(country as CountryId) : ""]
      .filter(Boolean)
      .join(", ") || "Location not recorded";
  const selectClass =
    "min-w-0 rounded border border-card-border bg-background px-2 py-1.5 text-xs text-foreground";
  const select = (
    label: string,
    value: string,
    values: { id: string; label: string }[],
    onChange: (v: string) => void
  ) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select
        aria-label={label}
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">All</option>
        {values.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="space-y-5" aria-label="Supply chain">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-card-border pb-3">
        <div>
          <h2 className="text-lg font-semibold">Supply chain</h2>
          <p className="mt-1 text-xs text-muted">
            Actual suppliers and customers from the last completed turn. Open-market relationships
            can change each turn.
          </p>
        </div>
        <button
          className="rounded border border-card-border px-3 py-1.5 text-xs hover:bg-card-elevated disabled:opacity-50"
          disabled={load.loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          Refresh
        </button>
      </div>
      {load.loading ? (
        <p role="status" className="animate-pulse py-8 text-sm text-muted">
          Loading settled trades...
        </p>
      ) : load.error ? (
        <div role="alert" className="rounded border border-error/30 bg-error/10 p-4 text-sm">
          {load.error}
          <button className="ml-3 underline" onClick={() => setRevision((v) => v + 1)}>
            Try again
          </button>
        </div>
      ) : data?.turn == null ? (
        <p className="py-6 text-sm text-muted">
          No completed market settlement is available in this world yet.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-card-border p-3">
              <p className="text-xs text-muted">Input purchases</p>
              <p className="mt-1 text-xl font-semibold">{formatAmount(totals("suppliers"))}</p>
            </div>
            <div className="rounded border border-card-border p-3">
              <p className="text-xs text-muted">Sales receipts</p>
              <p className="mt-1 text-xl font-semibold text-success">
                {formatAmount(totals("customers"))}
              </p>
            </div>
            <div className="rounded border border-card-border p-3">
              <p className="text-xs text-muted">Completed turn</p>
              <p className="mt-1 text-xl font-semibold">{data.turn}</p>
              <p className="text-[11px] text-muted">
                Totals follow your filters; internal deliveries excluded.
              </p>
            </div>
          </div>
          <div role="group" aria-label="Supply chain view" className="flex gap-1">
            {(
              [
                ["company", "Company-wide"],
                ["sites", "Sector / location"],
              ] as const
            ).map(([view, label]) => (
              <button
                key={view}
                aria-pressed={filters.view === view}
                className={`px-3 py-1.5 text-xs ${pillClass(filters.view === view)}`}
                onClick={() => setFilters({ ...filters, view })}
              >
                {label}
              </button>
            ))}
          </div>
          <fieldset className="rounded border border-card-border p-3">
            <legend className="px-1 text-xs text-muted">Filter your sites</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {select(
                "Country",
                filters.country,
                countries.map((id) => ({ id, label: countryName(id as CountryId) })),
                (country) => setFilters({ ...filters, country, state: "", type: "", sector: "" })
              )}
              {select(
                "State / region",
                filters.state,
                stateIds.map((id) => ({ id, label: data.states[id] ?? id })),
                (state) => setFilters({ ...filters, state, type: "", sector: "" })
              )}
              {select(
                "Sector type",
                filters.type,
                types.map((id) => ({ id, label: sectorLabel(id) })),
                (type) => setFilters({ ...filters, type, sector: "" })
              )}
              {select(
                "Sector / location",
                filters.sector,
                matchingSites.map((s) => ({
                  id: s.id,
                  label: `${sectorLabel(s.sectorType)}: ${location(s.countryId, s.stateId)}`,
                })),
                (sector) => setFilters({ ...filters, sector })
              )}
              {select(
                "Trade type",
                filters.mode,
                [
                  { id: "open-market", label: "Open market" },
                  { id: "agreement", label: "Supply agreement" },
                  { id: "internal", label: "Internal delivery" },
                ],
                (mode) => setFilters({ ...filters, mode })
              )}
            </div>
            <button
              className="mt-3 text-xs text-muted underline"
              onClick={() => setFilters({ ...initialFilters, view: filters.view })}
            >
              Clear filters
            </button>
          </fieldset>
          {(["suppliers", "customers"] as const).map((direction) => (
            <SupplyChainTable
              key={direction + data.turn + JSON.stringify(filters)}
              direction={direction}
              rows={rows.filter((r) => r.direction === direction)}
              parties={parties}
              location={location}
              bySite={filters.view === "sites"}
            />
          ))}
          <p className="text-xs text-muted">
            Trade values exclude tariffs, taxes and other operating costs. Internal deliveries move
            goods between your sites without a company cash payment. Units and totals here are for
            this one turn. Sector pages show the same flows as a daily rate, which is 24 turns.
          </p>
        </>
      )}
    </section>
  );
}
