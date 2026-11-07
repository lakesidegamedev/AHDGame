/**
 * The 2027 world's background countries as aggregate economies (#5702).
 *
 * SEED INDEPENDENCE: every input is 2027 data. Population and GDP come from the
 * 2027 national budget seed (the same anchors the 2027 regions are allocated
 * to), the sector mix from `sectorSeedWeights2027`, and resource endowments from
 * the country's authored extraction capacity. Only the behavioural scalars
 * below (fiscal capacity, stability, trade exposure, trend growth) are authored
 * here, with a one-line reason each. They are game values for a central path,
 * not forecasts. Provenance on every document is "authored-2027"; nothing here
 * falls back to the hash-based estimate other background entities use.
 */
import { COMMODITY_BASE_PRICES, type ExtractableResource } from "@/lib/constants/commodities";
import { SECTOR_MARKET_GDP_FRACTION } from "@/lib/constants/corporations";
import { eraRateForCurrency, type CurrencyCode } from "@/lib/constants/currencies";
import { getCountryDisplayName, type CountryId } from "@/lib/constants/countries";
import { getNationalBudgetSeedConfigsForPreset } from "@/lib/seeds/reference/budgets";
import { COUNTRY_SECTOR_WEIGHTS_2027 } from "@/lib/seeds/reference/sectorSeedWeights2027";
import { STATE_RESOURCE_CAPACITY } from "@/lib/seeds/reference/stateResourceCapacity";
import { backgroundCountriesFor } from "@/lib/world/eraRoster";
import { buildMacroCountryFromSpec, type MacroCountrySeedSpec } from "./seedBuilder";
import type { MacroCountryState } from "./types";

export const PRESET_2027 = "2027-default";

export interface Background2027Profile {
  /** 0-1 share of output the state can tax. */
  fiscalCapacity: number;
  /** 0-1 political and economic stability. */
  stability: number;
  /** 0-1 share of the economy that trades on the world market. */
  tradeExposure: number;
  /** Annual real trend growth on the central path. */
  trendGrowth: number;
  rationale: string;
  /**
   * Population and annual GDP (billions of ₳) for a country the 2027 budget
   * seed does not cover. Absent when the budget seed supplies both.
   */
  scale?: { population: number; gdpBillions: number };
}

export const BACKGROUND_2027_PROFILES: Readonly<Record<string, Background2027Profile>> = {
  IE: {
    fiscalCapacity: 0.24,
    stability: 0.85,
    tradeExposure: 0.8,
    trendGrowth: 0.03,
    rationale: "Small open economy built on multinational exports; low tax take on a large base.",
  },
  BR: {
    fiscalCapacity: 0.33,
    stability: 0.6,
    tradeExposure: 0.25,
    trendGrowth: 0.02,
    rationale: "Large, fairly closed economy; commodity exporter with polarised politics.",
  },
  NG: {
    fiscalCapacity: 0.1,
    stability: 0.45,
    tradeExposure: 0.35,
    trendGrowth: 0.03,
    rationale: "Oil-led exports, very thin tax base, security problems in several regions.",
  },
  RU: {
    fiscalCapacity: 0.35,
    stability: 0.55,
    tradeExposure: 0.3,
    trendGrowth: 0.01,
    rationale: "Energy exporter under sanctions; war economy holds output but caps trade.",
    scale: { population: 143_000_000, gdpBillions: 2_100 },
  },
  PL: {
    fiscalCapacity: 0.38,
    stability: 0.75,
    tradeExposure: 0.55,
    trendGrowth: 0.03,
    rationale: "Fast-converging EU manufacturing hub tied into German supply chains.",
    scale: { population: 36_600_000, gdpBillions: 950 },
  },
  HU: {
    fiscalCapacity: 0.43,
    stability: 0.7,
    tradeExposure: 0.7,
    trendGrowth: 0.02,
    rationale: "Highly export-dependent car and battery assembly; strained EU relations.",
  },
  RO: {
    fiscalCapacity: 0.32,
    stability: 0.68,
    tradeExposure: 0.45,
    trendGrowth: 0.025,
    rationale: "Converging EU economy with a persistent budget deficit.",
    scale: { population: 18_900_000, gdpBillions: 400 },
  },
  BG: {
    fiscalCapacity: 0.36,
    stability: 0.62,
    tradeExposure: 0.6,
    trendGrowth: 0.025,
    rationale: "Small open economy joining the euro; frequent snap elections.",
  },
  FR: {
    fiscalCapacity: 0.52,
    stability: 0.72,
    tradeExposure: 0.35,
    trendGrowth: 0.011,
    rationale: "High-tax services economy with slow growth and a fragmented parliament.",
  },
  IT: {
    fiscalCapacity: 0.48,
    stability: 0.68,
    tradeExposure: 0.35,
    trendGrowth: 0.007,
    rationale: "Manufacturing exporter with high public debt and weak trend growth.",
  },
  ES: {
    fiscalCapacity: 0.41,
    stability: 0.72,
    tradeExposure: 0.38,
    trendGrowth: 0.018,
    rationale: "Services and tourism led recovery, among the faster large euro economies.",
  },
  SE: {
    fiscalCapacity: 0.48,
    stability: 0.82,
    tradeExposure: 0.5,
    trendGrowth: 0.017,
    rationale: "Stable, trade-heavy industrial economy with strong public finances.",
  },
  TR: {
    fiscalCapacity: 0.3,
    stability: 0.5,
    tradeExposure: 0.35,
    trendGrowth: 0.03,
    rationale: "Large manufacturing base held back by high inflation and currency stress.",
  },
  AT: {
    fiscalCapacity: 0.49,
    stability: 0.82,
    tradeExposure: 0.55,
    trendGrowth: 0.012,
    rationale: "Rich, stable supplier economy closely tied to German industry.",
  },
  FI: {
    fiscalCapacity: 0.5,
    stability: 0.82,
    tradeExposure: 0.45,
    trendGrowth: 0.012,
    rationale: "Forestry, metals and technology exports on a Russian border.",
  },
  GR: {
    fiscalCapacity: 0.47,
    stability: 0.65,
    tradeExposure: 0.4,
    trendGrowth: 0.017,
    rationale: "Shipping and tourism economy still carrying very high public debt.",
  },
};

/**
 * Size a background economy like a full country of the same GDP. A full
 * country's state market is GDP (millions) x SECTOR_MARKET_GDP_FRACTION per
 * turn; the 1953 aggregate scale (GDP / 48) would make these countries
 * thousands of times too small to move a market.
 */
export const BACKGROUND_2027_CAPACITY_PER_GDP = SECTOR_MARKET_GDP_FRACTION;

/** Population and annual GDP in millions of ₳ for one country. */
export function background2027Scale(countryId: string): {
  population: number;
  annualGdpMillions: number;
} {
  const profile = BACKGROUND_2027_PROFILES[countryId];
  if (!profile) throw new Error(`No authored 2027 background profile for ${countryId}.`);
  const budget = getNationalBudgetSeedConfigsForPreset(PRESET_2027).find(
    (row) => row.countryId === countryId
  );
  if (budget && budget.population > 0 && budget.gdp > 0) {
    const rate = eraRateForCurrency(budget.currencyCode as CurrencyCode, PRESET_2027);
    if (!rate || rate <= 0) {
      throw new Error(`No 2027 exchange rate for ${countryId} (${budget.currencyCode}).`);
    }
    return {
      population: budget.population,
      annualGdpMillions: Math.round(budget.gdp / rate / 1_000_000),
    };
  }
  if (!profile.scale) {
    throw new Error(`2027 background country ${countryId} has no budget seed and no scale.`);
  }
  return {
    population: profile.scale.population,
    annualGdpMillions: profile.scale.gdpBillions * 1_000,
  };
}

/**
 * Resource endowment in ₳ per turn: the country's authored extraction
 * capacity (units per turn, before the engine's headroom multiplier), valued
 * at base prices. The kernel turns it back into units.
 */
export function background2027Resources(
  countryId: string
): Partial<Record<ExtractableResource, number>> {
  const out: Partial<Record<ExtractableResource, number>> = {};
  for (const entry of Object.values(STATE_RESOURCE_CAPACITY)) {
    if (entry.countryId !== countryId) continue;
    for (const [resource, units] of Object.entries(entry.resources) as [
      ExtractableResource,
      number,
    ][]) {
      if (!Number.isFinite(units) || units <= 0) continue;
      out[resource] = (out[resource] ?? 0) + units * COMMODITY_BASE_PRICES[resource];
    }
  }
  for (const resource of Object.keys(out) as ExtractableResource[]) {
    out[resource] = Math.round(out[resource]!);
  }
  return out;
}

export function buildBackground2027MacroSpec(countryId: string): MacroCountrySeedSpec {
  const profile = BACKGROUND_2027_PROFILES[countryId];
  if (!profile) throw new Error(`No authored 2027 background profile for ${countryId}.`);
  const sectorWeights = COUNTRY_SECTOR_WEIGHTS_2027[countryId];
  if (!sectorWeights) throw new Error(`No 2027 sector weights for ${countryId}.`);
  const { population, annualGdpMillions } = background2027Scale(countryId);
  return {
    entityId: countryId,
    displayName: getCountryDisplayName(countryId as CountryId, PRESET_2027),
    economicSystem: "market",
    population,
    annualGdpGameUnits: annualGdpMillions,
    fiscalCapacity: profile.fiscalCapacity,
    stability: profile.stability,
    tradeExposure: profile.tradeExposure,
    sectorWeights,
    resources: background2027Resources(countryId),
    perTurnCapacityPerGdp: BACKGROUND_2027_CAPACITY_PER_GDP,
    trendGrowth: profile.trendGrowth,
  };
}

/** True when `entityId` is one of the authored 2027 background countries for `presetId`. */
export function isAuthoredBackground2027(presetId: string, entityId: string): boolean {
  return (
    presetId === PRESET_2027 &&
    (backgroundCountriesFor(presetId) as string[]).includes(entityId) &&
    entityId in BACKGROUND_2027_PROFILES
  );
}

export function buildBackground2027MacroCountry(
  countryId: string,
  now = new Date()
): MacroCountryState {
  return buildMacroCountryFromSpec(buildBackground2027MacroSpec(countryId), now, {
    presetId: PRESET_2027,
    simulationTier: "background-macro",
    provenance: "authored-2027",
  });
}
