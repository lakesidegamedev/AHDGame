import type { Db } from "mongodb";
import { censusStateLean } from "@/lib/demographics/censusLean";
import { getGameStateCollection } from "@/lib/db/collections/gameState";
import type { State, StateDemographics } from "@/lib/db/types";
import { eraYearContextFromGameState } from "@/lib/era/context";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { getDisplayLean } from "@/lib/utils/demographics";
import {
  getLeanLabelHex,
  getSocialLeanLabelHex,
  getUkEconomicLeanLabelHex,
} from "@/lib/utils/politics";
import { loadCountryLeanScale } from "@/lib/regionLean/loadCountryLeanScale";
import { regionLeanDisplay, type CountryLeanScale } from "@/lib/regionLean/scale";
import { statesCollection } from "@/lib/db/repositories/states";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";

export interface MapLeanState {
  economicLean: number;
  socialLean: number;
  displayLean: number;
  /** Lean from the even split between the two main parties; what fills read. */
  labelEconomicLean: number;
  labelSocialLean: number;
  labelDisplayLean: number;
  color: string;
  label: string;
  tooltip: string[];
  economicColor: string;
  economicLabel: string;
  socialColor: string;
  socialLabel: string;
}

export async function computeLeanMap(
  db: Db,
  countryId: CountryId
): Promise<Record<string, MapLeanState>> {
  const [allStates, allDemographics, gameState, scale] = await Promise.all([
    statesCollection(db).find({ countryId }).toArray(),
    stateDemographicsCollection(db).find({ countryId }).toArray(),
    getGameStateCollection(db).then((col) =>
      col.findOne(
        { _id: "current" },
        { projection: { preset: 1, currentYear: 1, startingYear: 1 } }
      )
    ),
    loadCountryLeanScale(db, countryId),
  ]);
  const era = {
    preset: gameState?.preset ?? null,
    ...eraYearContextFromGameState(gameState),
  };

  if (countryId === COUNTRY_CONFIGS.UK.id || countryId === COUNTRY_CONFIGS.DE.id) {
    return buildLeanUK(countryId, allStates, allDemographics, era, scale);
  }
  return buildLeanUS(countryId, allStates, allDemographics, era, scale);
}

type EraLeanContext = { preset: string | null; year: number | null; startingYear: number | null };

/** Cached lean when stored, else the census electorate's; a region with neither is an error. */
function regionLean(
  countryId: CountryId,
  state: State,
  demo: StateDemographics | undefined,
  era: EraLeanContext
): { economicLean: number; socialLean: number } {
  if (state.cachedEconomicLean != null && state.cachedSocialLean != null) {
    return { economicLean: state.cachedEconomicLean, socialLean: state.cachedSocialLean };
  }
  if (!demo) throw new Error(`No census electorate for ${countryId} region ${state._id}`);
  return censusStateLean(demo, { countryId, stateId: state._id, ...era });
}

function buildLeanUS(
  countryId: CountryId,
  allStates: State[],
  allDemographics: StateDemographics[],
  era: EraLeanContext,
  scale: CountryLeanScale
): Record<string, MapLeanState> {
  const demoByState = new Map(allDemographics.map((d) => [d._id, d]));
  const result: Record<string, MapLeanState> = {};

  for (const state of allStates) {
    const stateId = state._id;
    const { economicLean, socialLean } = regionLean(
      countryId,
      state,
      demoByState.get(stateId),
      era
    );

    const displayLean = getDisplayLean(economicLean, socialLean);
    // Label and colours read from the even split between the two main parties.
    const shown = regionLeanDisplay(scale, economicLean, socialLean);
    const label = shown.label;
    const { color } = getLeanLabelHex(shown.displayTone);
    const econ = getLeanLabelHex(shown.economicTone);
    const social = getSocialLeanLabelHex(shown.socialTone);

    result[stateId] = {
      economicLean,
      socialLean,
      displayLean,
      labelEconomicLean: shown.economicTone,
      labelSocialLean: shown.socialTone,
      labelDisplayLean: shown.displayTone,
      color,
      label,
      economicColor: econ.color,
      economicLabel: econ.label,
      socialColor: social.color,
      socialLabel: social.label,
      tooltip: [
        state.name ?? stateId,
        `Political Lean: ${label}`,
        `Economic: ${economicLean >= 0 ? "+" : ""}${economicLean.toFixed(2)} · Social: ${socialLean >= 0 ? "+" : ""}${socialLean.toFixed(2)}`,
        "From demographics (weighted avg)",
      ],
    };
  }
  return result;
}

function buildLeanUK(
  countryId: CountryId,
  allStates: State[],
  allDemographics: StateDemographics[],
  era: EraLeanContext,
  scale: CountryLeanScale
): Record<string, MapLeanState> {
  const demoByState = new Map(allDemographics.map((d) => [d._id, d]));
  const result: Record<string, MapLeanState> = {};

  for (const state of allStates) {
    const stateId = state._id;
    const regionId = stateId;
    const { economicLean, socialLean } = regionLean(
      countryId,
      state,
      demoByState.get(stateId),
      era
    );

    const displayLean = getDisplayLean(economicLean, socialLean);
    const shown = regionLeanDisplay(scale, economicLean, socialLean);
    const label = shown.label;
    const combined = getUkEconomicLeanLabelHex(shown.displayTone);
    const econ = getUkEconomicLeanLabelHex(shown.economicTone);
    const socialMeta = getSocialLeanLabelHex(shown.socialTone);
    const socialColor = getUkEconomicLeanLabelHex(shown.socialTone).color;

    result[regionId] = {
      economicLean,
      socialLean,
      displayLean,
      labelEconomicLean: shown.economicTone,
      labelSocialLean: shown.socialTone,
      labelDisplayLean: shown.displayTone,
      color: combined.color,
      label,
      economicColor: econ.color,
      economicLabel: econ.label,
      socialColor,
      socialLabel: socialMeta.label,
      tooltip: [
        state.name ?? stateId,
        `Political Lean: ${label}`,
        `Economic: ${economicLean >= 0 ? "+" : ""}${economicLean.toFixed(2)} · Social: ${socialLean >= 0 ? "+" : ""}${socialLean.toFixed(2)}`,
      ],
    };
  }
  return result;
}
