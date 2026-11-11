import { NextResponse } from "next/server";
import { findMergedRegionMetricsManyForDisplay } from "@/lib/macroMetrics/displayMerge";
import { getDb } from "@/lib/mongodb";
import { handleRouteError } from "@/lib/api/errors";
import type { MetricCategoryId, StateMetrics } from "@/lib/db/types";
import type { State } from "@/lib/db/types/state";
import { NATIONAL_SCOPE } from "@/lib/constants/nationalScope";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { resolveGameYear } from "@/lib/era/era";
import { isMetricActive } from "@/lib/era/metricCatalog";
import { scoreMetric } from "@/lib/utils/metricScoring";
import { aggregateNationalMetricValue } from "@/lib/nationalMetrics/rules";
import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";

/** Maps CountryId → ISO 3166-1 numeric code used by the world map */
const COUNTRY_TO_ISO: Record<string, string> = {
  US: "840",
  UK: "826",
  DE: "276",
  JP: "392",
};

const ALL_CATEGORIES: MetricCategoryId[] = [
  "economic",
  "education",
  "healthcare",
  "infrastructure",
  "publicSafety",
  "environment",
  "social",
  "governance",
  "population",
  "mediaInformation",
];

/** One nation's row in the metrics response, keyed by ISO code or by country id. */
type CountryMetricsEntry = {
  countryId: string;
  name: string;
  hasData: boolean;
  categories: Record<string, Record<string, { value: number; score: number | null }>>;
  categoryScores: Record<string, number | null>;
  overallScore: number | null;
};

/**
 * GET /api/world/metrics
 *
 * Returns national-level aggregated metrics for every country that has data.
 * Response is keyed by ISO numeric code (matching the world map's country IDs).
 *
 * Query params:
 *   category  – optional MetricCategoryId to filter to a single category
 *   metric    – optional metricId within that category (requires category)
 *
 * Shape:
 * {
 *   countries: {
 *     "840": {
 *       countryId: "US",
 *       name: "United States",
 *       hasData: true,
 *       categories: {
 *         economic: {
 *           unemploymentRate: { value: 4.5, score: 81 },
 *           ...
 *         },
 *         ...
 *       },
 *       categoryScores: { economic: 72, education: 65, ... },
 *       overallScore: 68
 *     }
 *   },
 *   availableCategories: ["economic", ...],
 *   availableMetrics: { economic: ["unemploymentRate", ...], ... }
 * }
 */
// GET /api/world/metrics — Returns national-level aggregated metrics for every country, optionally filtered by category and metric.
// Auth: public
// Errors: 400
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryFilter = searchParams.get("category") as MetricCategoryId | null;
    const metricFilter = searchParams.get("metric");

    const db = await getDb();

    // Preset drives the era-scaled median-income band (global game setting);
    // the era fields drive era-aware score-band drift when the flag is on.
    const gameStateDoc = await db
      .collection<{
        _id: string;
        preset?: string;
        currentYear?: number;
        currentTurn?: number;
        startingYear?: number;
        eraSystemEnabled?: boolean;
        incomeBandIndexByCountry?: Partial<Record<string, number>>;
        incomeStartVintages?: Partial<Record<string, string>>;
      }>("gameState")
      .findOne({ _id: "current" });
    const preset = gameStateDoc?.preset ?? DEFAULT_SEED_PRESET;
    // Live year for era-aware score bands; null while the flag is off.
    const year = gameStateDoc?.eraSystemEnabled ? resolveGameYear(gameStateDoc) : null;
    // medianIncome era band inputs (null flag-off ⇒ legacy band).
    const startingYear = year != null ? (gameStateDoc?.startingYear ?? null) : null;
    const incomeIndexByCountry =
      year != null ? (gameStateDoc?.incomeBandIndexByCountry ?? null) : null;
    const incomeVintages = year != null ? (gameStateDoc?.incomeStartVintages ?? null) : null;

    // Fetch all national-scope documents
    const nationalDocIds = Object.keys(NATIONAL_SCOPE);
    // SP5: merged two-store national views (macro + non-playable political).
    const nationalDocs = await findMergedRegionMetricsManyForDisplay(db, {
      _id: { $in: nationalDocIds },
    });

    const categories = categoryFilter ? [categoryFilter] : ALL_CATEGORIES;

    // Build available metrics map by merging keys from all country docs.
    // Era existence gate: a metric inactive in EVERY listed country is dropped
    // from the pickers (per-country docs are additionally gated below).
    const availableMetrics: Record<string, string[]> = {};
    for (const cat of ALL_CATEGORIES) {
      const keys = new Set<string>();
      for (const doc of nationalDocs) {
        const catData = doc[cat];
        const docCountry = NATIONAL_SCOPE[String(doc._id)];
        if (catData) {
          for (const k of Object.keys(catData)) {
            if (isMetricActive(k, docCountry, year)) keys.add(k);
          }
        }
      }
      if (keys.size > 0) availableMetrics[cat] = Array.from(keys);
    }

    // Build per-country response. `countries` stays keyed by ISO-numeric for the
    // world map. `countriesById` carries every national document, because the
    // ISO map above only covers countries with a distinct code of their own:
    // SCO and WAL share GB's, and BAL has none, so keying a ranking on ISO
    // silently dropped most of the world.
    const countries: Record<string, CountryMetricsEntry> = {};
    const countriesById: Record<string, CountryMetricsEntry> = {};

    for (const [docId, countryId] of Object.entries(NATIONAL_SCOPE)) {
      const isoCode = COUNTRY_TO_ISO[countryId];
      const doc = nationalDocs.find((d) => String(d._id) === docId);
      const config = COUNTRY_CONFIGS[countryId];

      if (!doc) {
        const empty: CountryMetricsEntry = {
          countryId,
          name: config?.name ?? countryId,
          hasData: false,
          categories: {},
          categoryScores: {},
          overallScore: null,
        };
        countriesById[countryId] = empty;
        if (isoCode) countries[isoCode] = empty;
        continue;
      }

      const catData: Record<string, Record<string, { value: number; score: number | null }>> = {};
      const catScores: Record<string, number | null> = {};
      let totalScore = 0;
      let totalCount = 0;

      for (const cat of categories) {
        const metrics = doc[cat];
        if (!metrics) continue;

        const metricEntries: Record<string, { value: number; score: number | null }> = {};
        let catScoreSum = 0;
        let catScoreCount = 0;

        const metricKeys =
          metricFilter && categoryFilter === cat ? [metricFilter] : Object.keys(metrics);

        for (const key of metricKeys) {
          // Era existence gate: inactive metrics are omitted from the response
          // entirely (not just unscored).
          if (!isMetricActive(key, countryId, year)) continue;
          const mv = (metrics as Record<string, { value: number }>)[key];
          if (!mv) continue;
          const score = scoreMetric(
            key,
            mv.value,
            countryId,
            preset,
            year,
            incomeIndexByCountry?.[countryId] ?? null,
            startingYear,
            incomeVintages
          );
          metricEntries[key] = { value: mv.value, score };
          if (score !== null) {
            catScoreSum += score;
            catScoreCount++;
          }
        }

        catData[cat] = metricEntries;
        const avgScore = catScoreCount > 0 ? Math.round(catScoreSum / catScoreCount) : null;
        catScores[cat] = avgScore;
        if (avgScore !== null) {
          totalScore += avgScore;
          totalCount++;
        }
      }

      const entry: CountryMetricsEntry = {
        countryId,
        name: config?.name ?? countryId,
        hasData: true,
        categories: catData,
        categoryScores: catScores,
        overallScore: totalCount > 0 ? Math.round(totalScore / totalCount) : null,
      };
      countriesById[countryId] = entry;
      if (isoCode) countries[isoCode] = entry;
    }

    // Nations outside NATIONAL_SCOPE carry no stored national metrics document,
    // so they were absent from every world figure. Roll their regions up here
    // with the same aggregation the national phase uses, and from display-merged
    // region docs so the political half arrives through the board exactly as it
    // does for a national document.
    const nationalCountries = new Set<CountryId>(Object.values(NATIONAL_SCOPE) as CountryId[]);
    const regionStates = await db
      .collection<State>("states")
      .find(
        { countryId: { $nin: [...nationalCountries] } },
        { projection: { _id: 1, countryId: 1, population: 1, gdp: 1 } }
      )
      .toArray();
    const statesByCountry = new Map<string, State[]>();
    for (const state of regionStates) {
      if (!state.countryId) continue;
      const list = statesByCountry.get(state.countryId) ?? [];
      list.push(state);
      statesByCountry.set(state.countryId, list);
    }
    if (statesByCountry.size > 0) {
      const regionDocs = await findMergedRegionMetricsManyForDisplay(db, {
        _id: { $in: regionStates.map((state) => state._id) },
      });
      const regionById = new Map(regionDocs.map((doc) => [String(doc._id), doc]));
      for (const [countryId, countryStates] of statesByCountry) {
        if (countriesById[countryId]?.hasData) continue;
        const regionCatData: Record<
          string,
          Record<string, { value: number; score: number | null }>
        > = {};
        const regionCatScores: Record<string, number | null> = {};
        let regionTotalScore = 0;
        let regionTotalCount = 0;
        for (const cat of categories) {
          const categoryOf = (doc: StateMetrics | undefined) =>
            (
              doc as unknown as
                Record<string, Record<string, { value?: number }> | undefined> | undefined
            )?.[cat];
          const sample = countryStates
            .map((state) => categoryOf(regionById.get(String(state._id))))
            .find((entry) => entry && Object.keys(entry).length > 0);
          if (!sample) continue;
          const metricEntries: Record<string, { value: number; score: number | null }> = {};
          let catScoreSum = 0;
          let catScoreCount = 0;
          for (const key of Object.keys(sample)) {
            if (metricFilter && categoryFilter === cat && key !== metricFilter) continue;
            if (!isMetricActive(key, countryId as CountryId, year)) continue;
            const rows: Array<{
              value: number;
              population: number;
              gdp: number;
              laborForce?: number;
            }> = [];
            for (const state of countryStates) {
              const doc = regionById.get(String(state._id));
              const value = categoryOf(doc)?.[key]?.value;
              if (typeof value !== "number" || !Number.isFinite(value)) continue;
              const laborForce = doc?.economic?.laborForce?.value;
              rows.push({
                value,
                population: state.population ?? 0,
                gdp: state.gdp ?? 0,
                ...(typeof laborForce === "number" ? { laborForce } : {}),
              });
            }
            const value = aggregateNationalMetricValue(cat, key, rows);
            if (value === undefined) continue;
            const score = scoreMetric(
              key,
              value,
              countryId as CountryId,
              preset,
              year,
              incomeIndexByCountry?.[countryId] ?? null,
              startingYear,
              incomeVintages
            );
            metricEntries[key] = { value, score };
            if (score !== null) {
              catScoreSum += score;
              catScoreCount++;
            }
          }
          if (Object.keys(metricEntries).length === 0) continue;
          regionCatData[cat] = metricEntries;
          const avgScore = catScoreCount > 0 ? Math.round(catScoreSum / catScoreCount) : null;
          regionCatScores[cat] = avgScore;
          if (avgScore !== null) {
            regionTotalScore += avgScore;
            regionTotalCount++;
          }
        }
        countriesById[countryId] = {
          countryId,
          name: COUNTRY_CONFIGS[countryId as CountryId]?.name ?? countryId,
          hasData: Object.keys(regionCatData).length > 0,
          categories: regionCatData,
          categoryScores: regionCatScores,
          overallScore:
            regionTotalCount > 0 ? Math.round(regionTotalScore / regionTotalCount) : null,
        };
      }
    }

    const response = NextResponse.json({
      countries,
      countriesById,
      availableCategories: ALL_CATEGORIES,
      availableMetrics,
    });
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=900, no-transform"
    );
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
