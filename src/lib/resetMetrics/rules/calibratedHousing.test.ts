import { describe, expect, it } from "vitest";
import { calibratedHousingFixture } from "../testing/calibratedHousingFixture";
import { prepareCalibratedHousing } from "./calibratedHousing";
import { housingPublication } from "./housingPublication";
import type { HousingState } from "./housing";

function run(
  f: ReturnType<typeof calibratedHousingFixture>,
  states = new Map<string, HousingState>()
) {
  const prepared = prepareCalibratedHousing({ ...f, priorStates: states });
  const result = housingPublication({
    ...f,
    regionIds: f.regionIds,
    source: prepared.source,
    householdSource: f.households,
    priorStates: states,
  });
  return { prepared, result };
}
describe("public-calibrated residential housing", () => {
  it("resumes only the current flow after a missing-data turn without backfilling money", () => {
    const f = calibratedHousingFixture("UK");
    const first = run(f).result;
    const states = new Map([...first].map(([id, r]) => [id, r.state]));
    const resumed = run(calibratedHousingFixture("UK", 5), states);
    expect(resumed.result.size).toBe(12);
    for (const [id, row] of resumed.result) {
      const flow = resumed.prepared.source!.regions.find((r) => r.regionId === id)!.flow;
      expect(row.state.constructionCash).toBe(
        states.get(id)!.constructionCash + flow.constructionCashReceived - row.state.lastFlow!.spent
      );
      expect(row.state.lastFlow!.resumedFromTurn).toBe(2);
      expect(row.updates["24"]!.observedAtTurn).toBe(5);
    }
    const updated = new Map([...resumed.result].map(([id, r]) => [id, r.state]));
    expect(run(calibratedHousingFixture("UK", 5), updated).result).toEqual(resumed.result);
  });
  it.each(["US", "UK", "JP"] as const)(
    "conserves funding and publishes consecutive turns in %s",
    (country) => {
      let states = new Map<string, HousingState>();
      for (let turn = 2; turn <= 18; turn++) {
        const f = calibratedHousingFixture(country, turn);
        const { result } = run(f, states);
        expect(result.size).toBe(f.regionIds.length);
        states = new Map([...result].map(([id, r]) => [id, r.state]));
        expect(run(f, states).result).toEqual(result);
      }
      expect([...states.values()].some((s) => s.usableDwellings > s.model!.openingDwellings)).toBe(
        true
      );
    }
  );
  it.each(["US", "UK", "JP"] as const)(
    "activates complete %s with labeled provenance and exact retries",
    (country) => {
      const f = calibratedHousingFixture(country);
      const { prepared, result } = run(f);
      expect(prepared.gaps).toEqual([]);
      expect(result.size).toBe(f.regionIds.length);
      for (const row of result.values()) {
        expect(row.updates["24"]!.status).toBe("proxy");
        expect(row.updates["25"]!.definitionVersion).toBe(2);
        expect(row.state.lastFlow!.completed).toBe(0);
      }
      const states = new Map([...result].map(([id, r]) => [id, r.state]));
      expect(run(f, states).result).toEqual(result);
      const partial = new Map([[...states][0]!]);
      expect(run(f, partial).result).toEqual(result);
    }
  );
  it("does not convert business facility/service output into instant dwellings", () => {
    const f = calibratedHousingFixture("UK", 2, { crewDays: 1e12 });
    const { prepared, result } = run(f);
    expect([...result.values()].every((r) => r.state.lastFlow!.completed === 0)).toBe(true);
    expect(
      prepared.source!.regions.every((r) =>
        r.flow.newProjects.every((p) => p.earliestCompletionTurn === 14)
      )
    ).toBe(true);
  });
  it.each(["US", "UK", "JP"] as const)("honors regional funding geography in %s", (country) => {
    const regional = calibratedHousingFixture(country, 2, { regional: true });
    const { prepared, result } = run(regional);
    expect(result.size).toBe(regional.regionIds.length);
    const other = prepared.source!.regions[1]!;
    expect(other.payments.every((p) => p.annualLandlordAssistance === 0)).toBe(true);
    expect(prepared.source!.calibration!.assumptions.join(" ")).toContain("regional");
    const original = other.flow.constructionCashReceived;
    other.flow.constructionCashReceived += 100;
    prepared.source!.regions[0]!.flow.constructionCashReceived -= 100;
    expect(
      housingPublication({
        ...regional,
        source: prepared.source,
        householdSource: regional.households,
        priorStates: new Map(),
      }).size
    ).toBe(0);
    other.flow.constructionCashReceived = original;
  });
  it("fails closed on missing/stale inputs, unknown options and missing funding", () => {
    const f = calibratedHousingFixture("US");
    expect(
      prepareCalibratedHousing({
        ...f,
        priorStates: new Map(),
        construction: f.construction.slice(1),
      }).source
    ).toBeUndefined();
    expect(
      prepareCalibratedHousing({
        ...f,
        priorStates: new Map(),
        construction: f.construction.map((r) => ({ ...r, turn: 1 })),
      }).source
    ).toBeUndefined();
    expect(
      prepareCalibratedHousing({ ...f, priorStates: new Map(), settlements: new Map() }).source
    ).toBeUndefined();
    expect(
      prepareCalibratedHousing({
        ...f,
        priorStates: new Map(),
        programs: f.programs.map((p) => ({ ...p, choice: "unknown" })),
      }).source
    ).toBeUndefined();
  });
  it("keeps zero supply a valid constraint rather than a missing-data fallback", () => {
    const f = calibratedHousingFixture("JP", 2, { crewDays: 0, funding: 0 });
    const { prepared, result } = run(f);
    expect(result.size).toBe(8);
    expect(prepared.source!.regions.every((r) => r.flow.materialCapacity === 0)).toBe(true);
  });
  it("updates cost burden when income, taxes and prices change", () => {
    const f = calibratedHousingFixture("UK");
    const base = run(f).result;
    const higherIncome = run(calibratedHousingFixture("UK", 2, { income: 1.2 })).result;
    const inflation = run(calibratedHousingFixture("UK", 2, { prices: 1.2 })).prepared.source!;
    expect(higherIncome.values().next().value!.updates["24"]!.value).toBeLessThan(
      base.values().next().value!.updates["24"]!.value!
    );
    expect(inflation.regions[0]!.flow.costPerCompletedDwelling).toBeCloseTo(
      run(f).prepared.source!.regions[0]!.flow.costPerCompletedDwelling * 1.2,
      -1
    );
  });
  it("does not duplicate shared funding or household cash", () => {
    const f = calibratedHousingFixture("UK");
    f.settlements.set(f.programs[1]!._id, {
      ...f.settlements.get(f.programs[0]!._id)!,
      paymentKey: f.settlements.get(f.programs[0]!._id)!.paymentKey,
    });
    expect(run(f).prepared.source).toBeUndefined();
  });
  it("rejects a housing receipt already counted as a different household cash program", () => {
    const f = calibratedHousingFixture("US");
    const p = { ...f.programs[0]!, _id: "cash-alias", familyId: "L01" };
    f.programs.push(p);
    f.households.programRoles = [
      ...f.households.programRoles,
      {
        programId: p._id,
        familyId: p.familyId,
        effectiveTurn: p.effectiveTurn,
        choice: p.choice,
        role: "cash",
        cashShare: 0.9,
      },
    ];
    f.settlements.set(p._id, f.settlements.get(f.programs[0]!._id)!);
    expect(run(f).prepared.source).toBeUndefined();
  });
});
