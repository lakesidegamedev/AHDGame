/**
 * One region's society pressure step for a turn: education first (it speeds
 * re-employment), then automation absorption, then housing. Levels persist on
 * the region's macro document; a replayed turn returns the stored state.
 */
import { absorptionHalfLifeYears, advanceAutomationAbsorption } from "./automation";
import { advanceEducationIndex, educationIndexTarget } from "./education";
import {
  advanceHousingStock,
  households,
  housingCostOfLivingNudge,
  housingPressureIndex,
} from "./housing";
import {
  wageInsuranceSupport,
  zoningConstructionEffectiveness,
  type SocietyLawPositions,
} from "./laws";

export interface SocietyPressureState {
  version: 1;
  lastTurn: number;
  /** Workers automated plants in the region no longer employ. */
  automationDisplaced: number;
  /** Of those, how many the wider economy has found new work for. */
  automationAbsorbed: number;
  housingStock: number;
  housingPressure: number;
  educationIndex: number;
}

export interface RegionSocietyInput {
  turn: number;
  turnsPerYear: number;
  countryId: string;
  previous?: SocietyPressureState;
  adults: number;
  /** This turn's displaced stock; undefined keeps the previous reading. */
  automationDisplaced?: number;
  supplyGrowthPct?: number;
  universityEnrollment?: number;
  educationSpendingResponse: number;
  outputGap?: number;
  laws: SocietyLawPositions;
}

export interface RegionSocietyResult {
  state: SocietyPressureState;
  /** Extra background jobs from absorbed displaced workers. */
  absorbedJobs: number;
  costOfLivingNudge: number;
}

function usable(state: SocietyPressureState | undefined): state is SocietyPressureState {
  return (
    state?.version === 1 &&
    Number.isInteger(state.lastTurn) &&
    [
      state.automationDisplaced,
      state.automationAbsorbed,
      state.housingStock,
      state.housingPressure,
      state.educationIndex,
    ].every((v) => Number.isFinite(v) && v >= 0)
  );
}

export function advanceRegionSocietyPressures(input: RegionSocietyInput): RegionSocietyResult {
  const prev = usable(input.previous) ? input.previous : undefined;
  if (prev && prev.lastTurn >= input.turn) {
    return {
      state: prev,
      absorbedJobs: prev.automationAbsorbed,
      costOfLivingNudge: housingCostOfLivingNudge(prev.housingPressure),
    };
  }
  const educationIndex = advanceEducationIndex({
    previous: prev?.educationIndex,
    target: educationIndexTarget({
      universityEnrollment: input.universityEnrollment,
      spendingResponse: input.educationSpendingResponse,
    }),
    turnsPerYear: input.turnsPerYear,
  });
  const displaced = Math.max(
    0,
    Number.isFinite(input.automationDisplaced)
      ? (input.automationDisplaced as number)
      : (prev?.automationDisplaced ?? 0)
  );
  const absorbed = advanceAutomationAbsorption({
    displaced,
    previousAbsorbed: prev?.automationAbsorbed ?? 0,
    turnsPerYear: input.turnsPerYear,
    halfLifeYears: absorptionHalfLifeYears({
      wageInsuranceSupport: wageInsuranceSupport(input.laws.wageInsurance),
      outputGap: input.outputGap,
      educationIndex,
    }),
  });
  const householdCount = households(input.adults, input.countryId);
  const housingStock = advanceHousingStock({
    previousStock: prev?.housingStock,
    households: householdCount,
    supplyGrowthPct: input.supplyGrowthPct,
    zoningEffectiveness: zoningConstructionEffectiveness(input.laws.zoning),
    turnsPerYear: input.turnsPerYear,
  });
  const housingPressure = housingPressureIndex(householdCount, housingStock);
  return {
    state: {
      version: 1,
      lastTurn: input.turn,
      automationDisplaced: displaced,
      automationAbsorbed: absorbed,
      housingStock,
      housingPressure,
      educationIndex,
    },
    absorbedJobs: absorbed,
    costOfLivingNudge: housingCostOfLivingNudge(housingPressure),
  };
}
