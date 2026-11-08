/**
 * Kernel-tick shell for a background country's national state:
 * politics, the fiscal state its budget derives from, and its national index.
 *
 * Runs inside the macro kernel tick, so a country costs nothing on the five
 * turns in six it does not tick. Reads are batched over every country due this
 * turn: one projected budget read, and one party read only for countries whose
 * politics have not started yet. The caller folds the returned fields into its
 * own macro bulk write.
 */
import type { Db } from "mongodb";
import type { FederalBudget } from "@/lib/db/types/budget";
import type { PoliticalParty } from "@/lib/db/types/party";
import { COUNTRY_CURRENCY_MAP, type CurrencyCode } from "@/lib/constants/currencies";
import { countryNamePool } from "@/lib/npp/nameGenerator";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import type { MacroCountryState } from "./types";
import {
  BACKGROUND_CONSTITUTIONS,
  BACKGROUND_NAME_POOLS,
  type BackgroundConstitution,
} from "./rules/backgroundConstitution";
import {
  advanceNationalPolitics,
  initNationalPolitics,
  type NamePool,
  type NationalPoliticsEvent,
  type SeedParty,
} from "./rules/nationalPolitics";
import { advancePriceLevel, initialBackgroundFiscal } from "./rules/backgroundBudget";
import {
  advanceNationalIndex,
  initialNationalIndex,
  nationalIndexNav,
} from "./rules/nationalIndex";

/** True for the 2027 world's background countries, which carry a national state. */
export function isBackgroundNation(
  country: Pick<MacroCountryState, "simulationTier" | "entityId" | "dataQuality">
): boolean {
  return (
    country.simulationTier === "background-macro" &&
    country.dataQuality?.provenance === "authored-2027" &&
    country.entityId in BACKGROUND_CONSTITUTIONS
  );
}

const FALLBACK_NAME_POOL: NamePool = {
  firstNames: ["Alex", "Sam", "Jordan", "Maria", "Daniel", "Elena"],
  surnames: ["Novak", "Weber", "Rossi", "Silva", "Horvat", "Berg"],
};

function namePoolFor(countryId: string, constitution: BackgroundConstitution): NamePool {
  return (
    BACKGROUND_NAME_POOLS[countryId] ??
    countryNamePool(constitution.namePoolCountry ?? countryId) ??
    FALLBACK_NAME_POOL
  );
}

interface BudgetRow {
  _id: string;
  currencyCode?: string;
  gdp?: number;
  economicFactors?: { inflationRate?: number };
}

export interface BackgroundNationContext {
  year: number;
  worldSeed: string;
  turnsPerYear: number;
  budgets: Map<string, BudgetRow>;
  partiesByCountry: Map<string, SeedParty[]>;
}

/** Batched inputs for every background country due this tick, or null when none is. */
export async function loadBackgroundNationContext(
  db: Db,
  due: readonly MacroCountryState[],
  options: { year: number | null | undefined; worldSeed: string; turnsPerYear: number }
): Promise<BackgroundNationContext | null> {
  const nations = due.filter(isBackgroundNation);
  if (nations.length === 0) return null;
  const needParties = nations.filter((n) => !n.nationalPolitics).map((n) => n.entityId);
  const [budgets, parties] = await Promise.all([
    db
      .collection<FederalBudget>("federalBudget")
      .find(
        { _id: { $in: nations.map((n) => n.entityId) } },
        { projection: { currencyCode: 1, gdp: 1, "economicFactors.inflationRate": 1 } }
      )
      .toArray(),
    needParties.length > 0
      ? db
          .collection<PoliticalParty>("politicalParties")
          .find(
            { countryId: { $in: needParties as never[] }, isDefunct: { $ne: true } },
            {
              projection: {
                countryId: 1,
                name: 1,
                abbreviation: 1,
                color: 1,
                economicPosition: 1,
                socialPosition: 1,
                politicalStrength: 1,
                sequentialId: 1,
              },
            }
          )
          .toArray()
      : Promise.resolve([] as PoliticalParty[]),
  ]);
  const partiesByCountry = new Map<string, SeedParty[]>();
  for (const party of [...parties].sort((a, b) => a.sequentialId - b.sequentialId)) {
    const list = partiesByCountry.get(party.countryId) ?? [];
    list.push({
      partyId: String(party._id),
      name: party.name,
      abbreviation: party.abbreviation,
      color: party.color,
      economic: party.economicPosition,
      social: party.socialPosition,
      strength: party.politicalStrength,
    });
    partiesByCountry.set(party.countryId, list);
  }
  return {
    year: typeof options.year === "number" && Number.isFinite(options.year) ? options.year : 2027,
    worldSeed: options.worldSeed,
    turnsPerYear: options.turnsPerYear,
    budgets: new Map(budgets.map((b) => [String(b._id), b as BudgetRow])),
    partiesByCountry,
  };
}

export interface BackgroundNationUpdate {
  set: Partial<Pick<MacroCountryState, "nationalPolitics" | "nationalFiscal" | "nationalIndex">>;
  events: NationalPoliticsEvent[];
  /** Index mark for the national fund, when the index advanced. */
  indexMark: { countryId: string; displayName: string; currencyCode: string; nav: number } | null;
}

/**
 * The national state after this tick for one background country. `output` is
 * the aggregate output after this tick's growth.
 */
export function advanceBackgroundNation(
  country: MacroCountryState,
  context: BackgroundNationContext,
  turn: number,
  output: number
): BackgroundNationUpdate | null {
  if (!isBackgroundNation(country)) return null;
  const countryId = country.entityId;
  const constitution = BACKGROUND_CONSTITUTIONS[countryId];
  const budget = context.budgets.get(countryId);
  const inflation = budget?.economicFactors?.inflationRate ?? 2;
  const expectations = {
    trendGrowth: country.trendGrowth ?? 0,
    naturalUnemployment: constitution.naturalUnemployment,
  };
  const rng = makeSeededRng(`${context.worldSeed}:${countryId}:${turn}:nationalPolitics`);
  const namePool = namePoolFor(countryId, constitution);
  const events: NationalPoliticsEvent[] = [];
  const set: BackgroundNationUpdate["set"] = {};

  // Fiscal state: the baseline is fixed the first time the budget is read.
  const previousFiscal = country.nationalFiscal;
  const fiscal = previousFiscal
    ? {
        ...previousFiscal,
        priceLevel: advancePriceLevel(
          previousFiscal.priceLevel,
          inflation,
          turn - (country.lastMacroTickTurn ?? turn),
          context.turnsPerYear
        ),
      }
    : budget && typeof budget.gdp === "number" && budget.gdp > 0 && output > 0
      ? initialBackgroundFiscal({
          output,
          gdpLocal: budget.gdp,
          fiscalCapacity: country.fiscalCapacity,
          initialPrimaryBalance: constitution.initialPrimaryBalance,
        })
      : null;
  if (fiscal) set.nationalFiscal = fiscal;

  // Politics.
  const austerity = fiscal?.lastPackage
    ? { approvalCost: fiscal.lastPackage.approvalCost, turn: fiscal.lastPackage.turn }
    : null;
  if (country.nationalPolitics) {
    const advanced = advanceNationalPolitics(country.nationalPolitics, {
      countryId,
      constitution,
      turn,
      year: context.year,
      turnsPerYear: context.turnsPerYear,
      output,
      inflation,
      expectations,
      austerity,
      namePool,
      rng,
    });
    set.nationalPolitics = advanced.state;
    events.push(...advanced.events);
  } else {
    const started = initNationalPolitics({
      constitution,
      parties: context.partiesByCountry.get(countryId) ?? [],
      turn,
      year: context.year,
      turnsPerYear: context.turnsPerYear,
      output,
      inflation,
      expectations,
      namePool,
      rng,
    });
    if (started) {
      // A package enacted before politics started is not charged retroactively.
      set.nationalPolitics = { ...started, austerityAppliedTurn: austerity?.turn ?? null };
    }
  }

  // National index.
  const index = country.nationalIndex
    ? advanceNationalIndex(country.nationalIndex, {
        output,
        turn,
        turnsPerYear: context.turnsPerYear,
        stability: country.stability,
        exportFill: country.fundedTrade?.exportFill ?? null,
      })
    : initialNationalIndex(output, turn);
  set.nationalIndex = index;
  const currencyCode =
    budget?.currencyCode ?? COUNTRY_CURRENCY_MAP[countryId as keyof typeof COUNTRY_CURRENCY_MAP];

  return {
    set,
    events,
    indexMark: currencyCode
      ? {
          countryId,
          displayName: country.displayName,
          currencyCode: currencyCode as CurrencyCode,
          nav: nationalIndexNav(index.level),
        }
      : null,
  };
}
