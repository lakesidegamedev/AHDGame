import { describe, expect, it } from "vitest";
import { openingHouseholdCalibration1991 } from "../openingSeed1991";
import { prepareCalibratedHouseholds } from "./calibratedHouseholdCohorts";
import { modelHouseholdIncome } from "./modelHouseholdIncome";
import { produceHouseholdSource } from "./produceHouseholdSource";
import { householdPublication } from "./householdPublication";
import { householdBenefitFunding } from "./householdBenefitFunding";
import type { MetricLawProgram, MetricLawSettlement } from "./lawDelivery";
import { resetLawFamilies } from "@/lib/resetLegislation/catalog";
import { buildOpeningLawBoards1991 } from "@/lib/resetLegislation/openingBoards1991";
import { openingMetricPrograms } from "@/lib/metricEngine/rules/povertyOpening";

function setup(countryId: "US" | "UK" | "JP") {
  const calibration = openingHouseholdCalibration1991(countryId);
  const args = {
    countryId,
    worldId: "test-world",
    preset: "1991-default",
    calibration,
    regionIds: calibration.map((r) => r.regionId),
    programs: [] as MetricLawProgram[],
  };
  const pack = prepareCalibratedHouseholds(args);
  return {
    ...args,
    ...pack,
    turn: 2,
    year: 1991,
    current: undefined,
    fiscalControls: undefined,
    nationalTaxes: { incomeTax: 20, payrollTax: 10 },
    activity: calibration.map((r) => ({
      ...r,
      regionalTaxes: countryId === "US" ? { incomeTax: 5, propertyTax: 1 } : undefined,
      ...(countryId === "US" ? {} : { annualHouseholdLevy: r.population * r.medianIncome * 0.02 }),
    })),
    settlements: new Map<string, MetricLawSettlement>(),
  };
}

describe("explicit public-data-calibrated household cohorts", () => {
  it.each(["US", "UK", "JP"] as const)(
    "qualifies inherited %s statutes with exact opening option bindings",
    (country) => {
      const f = setup(country);
      const programs = openingMetricPrograms({
        worldId: f.worldId,
        boards: buildOpeningLawBoards1991(f.worldId, 1),
        replacements: [],
        accounts: [],
        familyIds: resetLawFamilies.map((family) => family.id),
      }).filter((p) => p.country === country);
      expect(programs.length).toBeGreaterThan(100);
      const pack = prepareCalibratedHouseholds({ ...f, programs });
      expect(pack.gaps).toEqual([]);
      expect(pack.model!.programRoles).toHaveLength(programs.length);
      expect(pack.model!.programRoles.filter((r) => r.role === "cash").length).toBeGreaterThan(0);
      for (const p of programs)
        expect(pack.model!.programRoles.find((r) => r.programId === p._id)).toMatchObject({
          familyId: p.familyId,
          choice: p.choice,
          effectiveTurn: p.effectiveTurn,
        });
    }
  );
  it("rejects malformed cohort provenance or tax bases rather than bypassing source gates", () => {
    const f = setup("US");
    expect(
      modelHouseholdIncome({
        ...f,
        reference: {
          ...f.reference!,
          cells: undefined as unknown as NonNullable<typeof f.reference>["cells"],
        },
      }).gaps
    ).toEqual(["incomplete-income-reference"]);
    expect(
      modelHouseholdIncome({
        ...f,
        reference: {
          ...f.reference!,
          calibration: { ...f.reference!.calibration!, sourceUrls: [] },
        },
      }).gaps
    ).toEqual(["invalid-public-cohort-calibration"]);
    expect(
      modelHouseholdIncome({
        ...f,
        activity: f.activity.map((r) => ({
          ...r,
          regionalTaxes: { incomeTax: 5, propertyTax: -1 },
        })),
      }).gaps
    ).toEqual(["invalid-current-property-levy"]);
  });
  it("recognizes every existing family/position and reconciles pooled insurance payments", () => {
    const f = setup("US");
    const programs: MetricLawProgram[] = resetLawFamilies.map((family) => ({
      _id: family.id,
      country: "US",
      scope: "national",
      familyId: family.id,
      choice: "center",
      effectiveTurn: 1,
      fundingAccountId: "account",
      primaryMetricEffects: [],
    }));
    f.programs = programs;
    Object.assign(f, prepareCalibratedHouseholds(f));
    expect(f.gaps).toEqual([]);
    for (const family of resetLawFamilies)
      for (const option of family.levels)
        expect(
          prepareCalibratedHouseholds({
            ...f,
            programs: [{ ...programs[0]!, familyId: family.id, choice: option.position }],
          }).gaps
        ).toEqual([]);
    for (const p of programs.filter((p) => ["L01", "L02"].includes(p.familyId)))
      f.settlements.set(p._id, {
        implementationFactor: 1,
        lastSettledTurn: 2,
        outlaid: 1000000,
        paymentKey: p._id,
      });
    const result = produceHouseholdSource({ ...f, ...modelHouseholdIncome(f) });
    expect(result.path).toBe("produced");
    expect(result.source!.coverage.reconciliation!.paidCashTransfers).toBeCloseTo(
      2 * 1000000 * 48 * 0.9,
      4
    );
    expect(
      f
        .model!.programRoles.flatMap((r) => r.recipients ?? [])
        .every((r) => r.eligibility >= 0 && r.eligibility <= 1)
    ).toBe(true);
  });
  it.each(["US", "UK", "JP"] as const)(
    "qualifies the complete %s roster and labels outputs as model proxies",
    (country) => {
      const f = setup(country);
      expect(f.gaps).toEqual([]);
      expect(f.reference!.cells).toHaveLength(f.regionIds.length * 60);
      expect(f.reference!.calibration!.assumptions.length).toBeGreaterThan(8);
      for (const r of f.calibration) {
        const people = f
          .reference!.cells.filter((c) => c.sourceArea === r.regionId)
          .reduce((s, c) => s + c.households! * (c.adults! + c.children!), 0);
        expect(people).toBeCloseTo(r.population * 0.98, 5);
      }
      const modeled = modelHouseholdIncome(f);
      expect(modeled.gaps).toEqual([]);
      const produced = produceHouseholdSource({ ...f, ...modeled });
      expect(produced.path).toBe("produced");
      expect(produced.source!.coverage.references.composition!.basis).toBe(
        "public-calibrated-model"
      );
      const readings = householdPublication({ ...f, source: produced.source });
      expect(readings.size).toBe(f.regionIds.length);
      for (const row of readings.values()) {
        expect(row["03"]!.status).toBe("proxy");
        expect(row["03"]!.note).toContain("not observed households");
        expect(row["03"]!.value).toBeGreaterThanOrEqual(0);
        expect(row["03"]!.value).toBeLessThanOrEqual(100);
      }
    }
  );
  it("keeps unsupported countries, presets, missing anchors and partial rosters on legacy", () => {
    const f = setup("US");
    for (const patch of [
      { countryId: "IE" },
      { preset: "2019-default" },
      { regionIds: f.regionIds.slice(1) },
      { calibration: f.calibration.map((r, i) => (i === 0 ? { ...r, medianIncome: NaN } : r)) },
    ])
      expect(prepareCalibratedHouseholds({ ...f, ...patch }).gaps.length).toBeGreaterThan(0);
  });
  it("binds every current option and rejects unknown laws instead of silently dropping them", () => {
    const f = setup("UK");
    const program: MetricLawProgram = {
      _id: "law",
      country: "UK",
      scope: "national",
      familyId: "L01",
      choice: "center",
      effectiveTurn: 1,
      fundingAccountId: "a",
      primaryMetricEffects: [],
    };
    expect(prepareCalibratedHouseholds({ ...f, programs: [program] }).gaps).toEqual([]);
    for (const patch of [{ choice: undefined }, { choice: "unknown" }, { familyId: "unknown" }])
      expect(
        prepareCalibratedHouseholds({ ...f, programs: [{ ...program, ...patch }] }).gaps
      ).toEqual(["unclassified-cohort-law-option"]);
  });
  it("national actual payments and regional funded accrual reconcile without crossing regional boundaries", () => {
    const f = setup("UK");
    const region = f.regionIds[0]!;
    const program: MetricLawProgram = {
      _id: "regional",
      country: "UK",
      scope: "regional",
      regionId: region,
      familyId: "L01",
      choice: "far_left",
      effectiveTurn: 1,
      fundingAccountId: "regional_budget",
      primaryMetricEffects: [],
    };
    f.programs = [program];
    Object.assign(f, prepareCalibratedHouseholds(f));
    f.settlements.set(program._id, {
      implementationFactor: 1,
      lastSettledTurn: 2,
      validThroughTurn: 3,
      fundedAnnualAmount: 1000000,
      fundingKey: "regional-payment",
    });
    const modeled = modelHouseholdIncome(f);
    const produced = produceHouseholdSource({ ...f, ...modeled });
    expect(produced.path).toBe("produced");
    expect(produced.source!.coverage.reconciliation!.paidCashTransfers).toBeCloseTo(900000, 5);
    for (const r of produced.source!.inputs) {
      const paid = r.groups.reduce((s, c) => s + c.households * c.paidCashTransfers, 0);
      expect(paid).toBeCloseTo(r.regionId === region ? 900000 : 0, 5);
    }
    expect(householdPublication({ ...f, source: produced.source }).size).toBe(f.regionIds.length);
    expect(householdBenefitFunding(program, f.settlements, 2, false)).toBeUndefined();
    expect(householdBenefitFunding(program, f.settlements, 4, true)).toBeUndefined();
    f.settlements.get(program._id)!.fundedAnnualAmount = undefined;
    expect(householdBenefitFunding(program, f.settlements, 2, true)).toBeUndefined();
  });
  it("work-credit options exclude non-wage cohorts and option changes rebuild eligibility", () => {
    const f = setup("JP");
    const p: MetricLawProgram = {
      _id: "credit",
      country: "JP",
      scope: "national",
      familyId: "L01",
      choice: "center_right",
      effectiveTurn: 1,
      fundingAccountId: "a",
      primaryMetricEffects: [],
    };
    const pack = prepareCalibratedHouseholds({ ...f, programs: [p] });
    const role = pack.model!.programRoles[0]!;
    expect(
      role.recipients!.filter((r) => r.id.endsWith("non-wage")).every((r) => r.eligibility === 0)
    ).toBe(true);
    const changed = prepareCalibratedHouseholds({ ...f, programs: [{ ...p, choice: "far_left" }] });
    expect(
      changed.model!.programRoles[0]!.recipients!.some(
        (r) => r.id.endsWith("non-wage") && r.eligibility > 0
      )
    ).toBe(true);
  });
  it("responds to current growth, income-tax and regional-levy changes", () => {
    const f = setup("JP");
    const base = modelHouseholdIncome(f);
    expect(base.gaps).toEqual([]);
    const growth = modelHouseholdIncome({
      ...f,
      activity: f.activity.map((r) => ({ ...r, output: r.output * 1.2 })),
    });
    expect(growth.fiscalControls!.annualMarketIncome).toBeCloseTo(
      base.fiscalControls!.annualMarketIncome * 1.2,
      0
    );
    const taxed = modelHouseholdIncome({ ...f, nationalTaxes: { incomeTax: 30, payrollTax: 10 } });
    expect(taxed.fiscalControls!.annualDirectTaxes).toBeGreaterThan(
      base.fiscalControls!.annualDirectTaxes
    );
    const levy = modelHouseholdIncome({
      ...f,
      activity: f.activity.map((r) => ({
        ...r,
        annualHouseholdLevy: r.annualHouseholdLevy! * 1.5,
      })),
    });
    expect(levy.fiscalControls!.annualDirectTaxes).toBeGreaterThan(
      base.fiscalControls!.annualDirectTaxes
    );
    expect(
      modelHouseholdIncome({
        ...f,
        activity: f.activity.map((r) => ({ ...r, annualHouseholdLevy: NaN })),
      }).gaps
    ).toEqual(["invalid-current-regional-household-levy"]);
  });
});
