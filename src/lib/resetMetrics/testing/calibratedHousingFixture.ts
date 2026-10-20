/** Controlled production-rule fixture, never installed in a player world. */
import { openingHouseholdCalibration1991 } from "../openingSeed1991";
import { prepareCalibratedHouseholds } from "../rules/calibratedHouseholdCohorts";
import { modelHouseholdIncome } from "../rules/modelHouseholdIncome";
import { produceHouseholdSource } from "../rules/produceHouseholdSource";
import { householdPublication } from "../rules/householdPublication";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import type { MetricLawProgram, MetricLawSettlement } from "../rules/lawDelivery";

export function calibratedHousingFixture(
  country: "US" | "UK" | "JP",
  turn = 2,
  options: {
    funding?: number;
    crewDays?: number;
    prices?: number;
    income?: number;
    regional?: boolean;
  } = {}
) {
  const worldId = "housing-experiment",
    calibration = openingHouseholdCalibration1991(country);
  const programs: MetricLawProgram[] = ["L22", "L23", "L24"].map((familyId) => ({
    _id: `${country}:${familyId}`,
    country,
    scope: options.regional ? "regional" : "national",
    ...(options.regional ? { regionId: calibration[0]!.regionId } : {}),
    familyId,
    choice: "center_left",
    fundingAccountId: "housing",
    effectiveTurn: 1,
    primaryMetricEffects: [],
  }));
  const args = {
    worldId,
    countryId: country,
    preset: "1991-default",
    regionIds: calibration.map((r) => r.regionId),
    calibration,
    programs,
  };
  const pack = prepareCalibratedHouseholds(args);
  const settlements = new Map<string, MetricLawSettlement>();
  const annual = calibration.reduce((n, r) => n + r.population * r.medianIncome, 0);
  for (const p of programs) {
    const amount =
      annual *
      (p.familyId === "L22" ? 0.005 : p.familyId === "L23" ? 0.002 : 0.0002) *
      (options.funding ?? 1);
    settlements.set(
      p._id,
      options.regional
        ? {
            implementationFactor: options.funding ?? 1,
            lastSettledTurn: turn,
            validThroughTurn: turn,
            fundingKey: `${p._id}:${turn}`,
            fundedAnnualAmount: amount,
          }
        : {
            implementationFactor: options.funding ?? 1,
            lastSettledTurn: turn,
            paymentKey: `${p._id}:${turn}`,
            outlaid: Math.floor(amount / 48),
          }
    );
  }
  const modeled = modelHouseholdIncome({
    ...args,
    ...pack,
    turn,
    year: 1991 + Math.floor((turn - 1) / 48),
    nationalTaxes: { incomeTax: 20, payrollTax: 10 },
    activity: calibration.map((r) => ({
      ...r,
      output: r.output * (options.income ?? 1),
      costOfLiving: r.costOfLiving * (options.prices ?? 1),
      regionalTaxes:
        country === COUNTRY_CONFIGS.US.id ? { incomeTax: 5, propertyTax: 1 } : undefined,
      ...(country !== COUNTRY_CONFIGS.US.id ? { annualHouseholdLevy: 0 } : {}),
    })),
  });
  const produced = produceHouseholdSource({
    ...args,
    reference: pack.reference,
    current: modeled.current,
    fiscalControls: modeled.fiscalControls,
    turn,
    year: 1991 + Math.floor((turn - 1) / 48),
    settlements,
  });
  if (!produced.source) throw new Error(`Household fixture incomplete: ${produced.gaps.join(",")}`);
  const householdReadings = householdPublication({
    ...args,
    turn,
    source: produced.source,
    settlements,
  });
  const construction = calibration.map((r) => ({
    regionId: r.regionId,
    population: r.population,
    turn,
    crewDays: options.crewDays ?? r.population / 50,
  }));
  return {
    ...args,
    reference: pack.reference,
    households: produced.source,
    householdReadings,
    settlements,
    construction,
    turn,
  };
}
