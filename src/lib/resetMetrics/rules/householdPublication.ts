/**
 * Household publication uses complete reference inputs and paid-law evidence.
 * householdPublication calculates one national threshold and keeps countries
 * with missing inputs on their existing definitions, never synthetic households.
 */
import {
  resolveHouseholdResources,
  householdResourceOutcomes,
  type HouseholdResourceInput,
} from "./householdResources";
import { resolveHouseholdCountry, type HouseholdCountryCoverage } from "./householdReadiness";
import {
  metricLawOutlaysAtTurn,
  type MetricLawProgram,
  type MetricLawSettlement,
  metricLawRoleMatches,
  type MetricLawRoleBinding,
} from "./lawDelivery";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import type { OpeningMetricObservation } from "./openingObservation";

export interface HouseholdPublicationSource {
  incomeBasis?: "modeled-economic-income";
  worldId: string;
  coverage: HouseholdCountryCoverage;
  inputs: readonly HouseholdResourceInput[];
  /** Every current statute needs a reviewed role; services are never household cash. */
  programRoles: readonly (MetricLawRoleBinding & {
    role: "cash" | "service" | "capital" | "regulation";
    cashShare?: number;
  })[];
}

export interface CountryMetricBasis {
  countryId: string;
  coverageKey: string;
  measurementTurn: number;
  value: number;
}

export const HOUSEHOLD_PUBLICATION_IDS = ["02", "03", "04"] as const;
export const regionalCoverageKey = (ids: readonly string[]) => JSON.stringify([...ids].sort());

/** A failed gate returns no new definition. The shell retains prior adopted readings if necessary. */
export function householdPublication(input: {
  worldId: string;
  countryId: string;
  turn: number;
  regionIds: readonly string[];
  source: HouseholdPublicationSource | undefined;
  programs: readonly MetricLawProgram[];
  settlements: ReadonlyMap<string, MetricLawSettlement>;
}): Map<string, Record<string, OpeningMetricObservation>> {
  const output = new Map<string, Record<string, OpeningMetricObservation>>();
  const source = input.source;
  if (
    !source ||
    source.worldId !== input.worldId ||
    source.coverage.countryId !== input.countryId ||
    source.coverage.measurementTurn !== input.turn ||
    regionalCoverageKey(source.coverage.regions.map((r) => r.regionId)) !==
      regionalCoverageKey(input.regionIds)
  )
    return output;
  const programs = input.programs.filter((p) => p.country === input.countryId);
  const roles = new Map(source.programRoles.map((r) => [r.programId, r]));
  if (
    roles.size !== source.programRoles.length ||
    roles.size !== programs.length ||
    programs.some((p) => !metricLawRoleMatches(p, roles.get(p._id)))
  )
    return output;
  let annualPaidCash = 0;
  const seenPayments = new Set<string>();
  for (const program of programs) {
    const role = roles.get(program._id)!;
    if (role.role !== "cash") continue;
    if (!Number.isFinite(role.cashShare) || role.cashShare! < 0 || role.cashShare! > 1)
      return output;
    // Regional annual funded spending has no proven per-turn cash schedule yet.
    // Do not turn it into a transfer by dividing it by 48 or multiplying a score.
    if (program.scope !== "national") return output;
    const receipts = metricLawOutlaysAtTurn([program], input.settlements, input.turn);
    for (const receipt of receipts) {
      if (seenPayments.has(receipt.paymentKey)) return output;
      seenPayments.add(receipt.paymentKey);
      annualPaidCash += receipt.amount * role.cashShare! * TURNS_PER_YEAR;
    }
  }
  const control = source.coverage.reconciliation;
  if (
    !control ||
    Math.abs(control.paidCashTransfers - annualPaidCash) > Math.max(1, annualPaidCash) * 1e-9
  )
    return output;
  const readings = source.inputs.map(resolveHouseholdResources);
  const result = resolveHouseholdCountry({ existing: null, coverage: source.coverage, readings });
  if (
    result.path !== "household-resources" ||
    result.value.gini === null ||
    result.value.poverty50.rate === null
  )
    return output;
  const national = result.value;
  const coverageKey = regionalCoverageKey(input.regionIds);
  for (const reading of readings) {
    const local = householdResourceOutcomes([reading]);
    const poverty = national.regions.find((r) => r.regionId === reading.regionId)!.poverty50;
    if (local.gini === null || poverty.rate === null) return new Map();
    const definitions = [
      [
        "02",
        "economic.realPurchasingPower",
        local.realMedian,
        national.realMedian,
        "annual real equivalised disposable income",
      ],
      [
        "03",
        "economic.povertyRate",
        poverty.rate,
        national.poverty50.rate!,
        "% people below 50% national median disposable income",
      ],
      ["04", "social.incomeInequality", local.gini, national.gini!, "Gini points, 0-100"],
    ] as const;
    output.set(
      reading.regionId,
      Object.fromEntries(
        definitions.map(([id, path, value, countryValue, unit]) => [
          id,
          {
            metricId: id,
            path,
            value,
            unit,
            definitionVersion: 2,
            owner: "households",
            status: "derived",
            source:
              source.incomeBasis === "modeled-economic-income"
                ? "modeled household earnings and tax owner; settled cash benefits"
                : "reconciled reference household resource owner",
            observedAtTurn: input.turn,
            note:
              (source.incomeBasis === "modeled-economic-income"
                ? "Earnings and taxes are modeled from current regional output, population and enacted game tax rates, not observed cash settlements or real-world filing-unit liabilities. Reference composition and income ranks are held fixed. Prices use the regional cost-of-living index relative to calibration, with proportional nominal repricing. Benefits require current paid funding. "
                : "") +
              (id === "03"
                ? `People below half the national median equivalised disposable income. National threshold: ${national.threshold50} ${reading.currency}. Taxes and actual paid cash transfers are included; services are not cash.`
                : "Reference household distribution after direct taxes, employee contributions and paid cash transfers. Square-root household-size equivalisation; purchasing power uses the reviewed consumer basket."),
            countryBasis: {
              countryId: input.countryId,
              coverageKey,
              measurementTurn: input.turn,
              value: countryValue,
            },
          },
        ])
      )
    );
  }
  return output;
}
