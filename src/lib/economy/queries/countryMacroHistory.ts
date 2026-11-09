/**
 * National macro history for the country economy page
 * (`GET /api/country/[code]/economy/history`).
 *
 * Read path only. The per-turn national GDP and population levels already
 * exist in `macroTelemetry` (written by `stateEffectsPhase`), one point per
 * (world, country, region, metric, turn) with a unique index on exactly that
 * coordinate. This loader issues two projected, index-covered reads for the
 * national rows (`region: null`) and hands them to the portable series rules,
 * so the page never rebuilds history from growth rates and adds no work to the
 * turn.
 */
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import type { Db } from "mongodb";
import { getMacroTelemetryCollection } from "@/lib/db/collections/longHorizonTelemetry";
import { buildWorldId } from "@/lib/telemetry/longHorizon/rules";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import {
  MACRO_GDP_METRIC,
  MACRO_POPULATION_METRIC,
  buildNationalMacroSeries,
  normalizeHistoryTurns,
  type NationalMacroPoint,
} from "@/lib/economy/rules/macroHistory";

export interface CountryMacroHistory {
  countryId: CountryId;
  currencyCode: string;
  /** Latest completed turn recorded in the world clock. */
  currentTurn: number;
  /** Window size actually used, after clamping. */
  turns: number;
  /** Oldest first, newest last. */
  points: NationalMacroPoint[];
}

interface MacroRow {
  turn: number;
  year?: number | null;
  value: number;
}

const EMPTY_TURN = 0;

/**
 * Load one country's national GDP and population series. Never throws on an
 * unseeded world: it returns an empty series and the page shows its honest
 * empty state instead of implying a zero economy.
 */
export async function buildCountryMacroHistory(
  db: Db,
  countryId: CountryId,
  requestedTurns?: number | null,
  requestedUntil?: number | null
): Promise<CountryMacroHistory> {
  const turns = normalizeHistoryTurns(requestedTurns);
  const currencyCode = COUNTRY_CONFIGS[countryId].currencyCode;

  const gameState = await (
    await getGameStateCollection(db)
  ).findOne(
    { _id: "current" },
    {
      projection: { _id: 1, currentTurn: 1, preset: 1, iteration: 1 },
    }
  );

  const currentTurn =
    typeof gameState?.currentTurn === "number" && Number.isFinite(gameState.currentTurn)
      ? gameState.currentTurn
      : EMPTY_TURN;

  if (!gameState?.preset) {
    return { countryId, currencyCode, currentTurn, turns, points: [] };
  }

  const worldId = buildWorldId({
    preset: gameState.preset,
    iterationType: gameState.iteration?.type ?? null,
    iterationNumber: gameState.iteration?.number ?? null,
  });

  // Telemetry rows are written while a turn is still running, so a turn that
  // has not committed can leave rows above the world clock. The series is a
  // record of completed turns only: the window ends at the world clock, or at
  // the turn the caller says it is refetching for, never past it.
  const upperTurn =
    typeof requestedUntil === "number" && Number.isFinite(requestedUntil)
      ? Math.min(Math.max(0, Math.floor(requestedUntil)), currentTurn)
      : currentTurn;

  // One read per metric keeps both queries fully index-covered: the unique
  // (world, country, region, metric, turn) index supplies equality on the
  // first four fields and the turn window as a suffix range, so no sort stage
  // is needed. Two round trips, bounded by the requested window.
  const collection = getMacroTelemetryCollection(db);
  const baseFilter = {
    worldId,
    country: countryId,
    region: null,
    turn: { $gte: Math.max(0, upperTurn - turns + 1), $lte: upperTurn },
  };
  const projection = { _id: 0, turn: 1, year: 1, value: 1 };

  const [gdpRows, populationRows] = await Promise.all([
    collection
      .find({ ...baseFilter, metric: MACRO_GDP_METRIC }, { projection })
      .sort({ turn: 1 })
      .limit(turns + 1)
      .toArray() as Promise<MacroRow[]>,
    collection
      .find({ ...baseFilter, metric: MACRO_POPULATION_METRIC }, { projection })
      .sort({ turn: 1 })
      .limit(turns + 1)
      .toArray() as Promise<MacroRow[]>,
  ]);

  return {
    countryId,
    currencyCode,
    currentTurn,
    turns,
    points: buildNationalMacroSeries({ gdp: gdpRows, population: populationRows }),
  };
}
