"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MetricCategoryId } from "@/lib/db/types";
import { fetchJson } from "@/lib/observability/fetchJson";
import type { CountryId } from "@/lib/constants/countriesCore";
import type { MetricFilter } from "./components/GlobeMetricPanel";
import { hasBlocData } from "./worldBlocs";
import { useActivePreset } from "@/contexts/RegisteredCountriesContext";
import { rankNations, type RankingSelection } from "@/lib/world/rankings";
import { toggleComparePair } from "@/lib/world/countryCompare";

/** ISO numeric codes used by the world map TopoJSON */
const COUNTRY_ID_TO_ISO: Record<CountryId, string> = {
  US: "840",
  UK: "826",
  DE: "276",
  JP: "392",
  IE: "372",
  BR: "076",
  CN: "156",
  NG: "566",
  HU: "348",
  PL: "616",
  RO: "642",
  YU: "890",
  BG: "100",
  UKR: "804",
  BLR: "112",
  CS: "200",
  BAL: "",
  RU: "810",
  FR: "250",
  IT: "380",
  ES: "724",
  SE: "752",
  TR: "792",
  GR: "300",
  AT: "040",
  FI: "246",
  DD: "278",
  SCO: "826", // shares GB code; not rendered until secession (absent from COUNTRY_ORDER)
  WAL: "826", // shares GB code; not rendered until secession (absent from COUNTRY_ORDER)
};

/** One nation as the world metrics API returns it. */
export interface WorldMetricsCountry {
  countryId: string;
  name: string;
  hasData: boolean;
  categories: Record<string, Record<string, { value: number; score: number | null }>>;
  categoryScores: Record<string, number | null>;
  overallScore: number | null;
}

/** World metrics API response shape (subset used by map + nation cards) */
export interface WorldMetricsData {
  /** Keyed by ISO-numeric, which is what the map's features are keyed by. */
  countries: Record<string, WorldMetricsCountry>;
  /** Every national document keyed by country id; the ISO map above covers four. */
  countriesById?: Record<string, WorldMetricsCountry>;
  availableCategories: MetricCategoryId[];
  availableMetrics: Record<string, string[]>;
}

type WorldMetricFilterContextValue = {
  metricFilter: MetricFilter;
  setMetricFilter: (f: MetricFilter) => void;
  worldMetrics: WorldMetricsData | null;
  partyData: Record<string, { partyName: string; partyColor: string; count: number }>;
  corpsData: { countries: Record<string, { count: number }>; maxCount: number } | null;
  countryIdToIso: (id: CountryId) => string | undefined;
  /** World rank for the active metric filter, or null when the filter has no rank. */
  rankFor: (id: CountryId) => number | null;
  /** Whether a click on the map selects a nation for comparison instead of opening it. */
  compareMode: boolean;
  setCompareMode: (on: boolean) => void;
  /** The two nations picked on the map, left to right. */
  compareCountryIds: CountryId[];
  toggleCompareCountry: (id: CountryId) => void;
  clearCompare: () => void;
};

const WorldMetricFilterContext = createContext<WorldMetricFilterContextValue | null>(null);

export function WorldMetricFilterProvider({ children }: { children: ReactNode }) {
  // East / West / Non-Aligned is the default view of the world: the first thing
  // a player should read off the globe is who is on whose side.
  //
  // Only where there ARE sides, though. A 2019 world has no blocs, so this used
  // to boot into a mode whose lookup is empty — tier colours under a West/East/
  // Non-Aligned legend, describing something not on the screen. Falls back to
  // the tier view there, which is what that world's default always should have
  // been.
  const preset = useActivePreset();
  const [metricFilter, setMetricFilter] = useState<MetricFilter>(() =>
    hasBlocData(preset) ? { type: "blocs" } : { type: "none" }
  );
  const [worldMetrics, setWorldMetrics] = useState<WorldMetricsData | null>(null);
  const [partyData, setPartyData] = useState<
    Record<string, { partyName: string; partyColor: string; count: number }>
  >({});
  const [corpsData, setCorpsData] = useState<{
    countries: Record<string, { count: number }>;
    maxCount: number;
  } | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareCountryIds, setCompareCountryIds] = useState<CountryId[]>([]);

  useEffect(() => {
    fetchJson<WorldMetricsData>("/api/world/metrics", { feature: "world-metrics" })
      .then((data) => {
        if (data) setWorldMetrics(data);
      })
      .catch(() => {});

    fetchJson<Record<string, { partyName: string; partyColor: string; count: number }>>(
      "/api/world/parties",
      { feature: "world-parties" }
    )
      .then((data) => setPartyData(data))
      .catch(() => {});

    fetchJson<{ countries: Record<string, { count: number }>; maxCount: number }>(
      "/api/world/corps",
      { feature: "world-corps" }
    )
      .then((data) => {
        if (data) setCorpsData(data);
      })
      .catch(() => {});
  }, []);

  const countryIdToIso = useCallback((id: CountryId) => COUNTRY_ID_TO_ISO[id], []);

  // World rank per nation for whatever the globe is filtered on, so the nation
  // table can show position and not only a raw figure. Overall, category and
  // metric views rank; blocs, parties and corporation counts do not.
  const ranks = useMemo(() => {
    if (!worldMetrics) return null;
    if (
      metricFilter.type !== "overall" &&
      metricFilter.type !== "category" &&
      metricFilter.type !== "metric"
    ) {
      return null;
    }
    const selection: RankingSelection =
      metricFilter.type === "overall"
        ? { kind: "overall" }
        : metricFilter.type === "category"
          ? { kind: "category", category: metricFilter.categoryId }
          : { kind: "metric", category: metricFilter.categoryId, metric: metricFilter.metricId };
    const ranking = rankNations(
      Object.values(worldMetrics.countriesById ?? worldMetrics.countries),
      selection
    );
    return new Map(
      ranking.filter((row) => row.rank !== null).map((row) => [row.countryId, row.rank!])
    );
  }, [metricFilter, worldMetrics]);
  const rankFor = useCallback((id: CountryId) => ranks?.get(id) ?? null, [ranks]);

  const toggleCompareCountry = useCallback((id: CountryId) => {
    setCompareCountryIds((current) => toggleComparePair(current, id) as CountryId[]);
  }, []);
  const clearCompare = useCallback(() => setCompareCountryIds([]), []);

  // Leaving comparison mode drops the picks. Coming back should start a fresh
  // pair, not silently reopen the last one the player has stopped thinking about.
  useEffect(() => {
    if (!compareMode) setCompareCountryIds([]);
  }, [compareMode]);

  const value = useMemo(
    () => ({
      metricFilter,
      setMetricFilter,
      worldMetrics,
      partyData,
      corpsData,
      countryIdToIso,
      rankFor,
      compareMode,
      setCompareMode,
      compareCountryIds,
      toggleCompareCountry,
      clearCompare,
    }),
    [
      metricFilter,
      worldMetrics,
      partyData,
      corpsData,
      countryIdToIso,
      rankFor,
      compareMode,
      compareCountryIds,
      toggleCompareCountry,
      clearCompare,
    ]
  );

  return (
    <WorldMetricFilterContext.Provider value={value}>{children}</WorldMetricFilterContext.Provider>
  );
}

export function useWorldMetricFilter(): WorldMetricFilterContextValue {
  const ctx = useContext(WorldMetricFilterContext);
  if (!ctx) {
    throw new Error("useWorldMetricFilter must be used within WorldMetricFilterProvider");
  }
  return ctx;
}

/** For components that may render outside the world page (e.g. shared cards). */
export function useWorldMetricFilterOptional(): WorldMetricFilterContextValue | null {
  return useContext(WorldMetricFilterContext);
}
