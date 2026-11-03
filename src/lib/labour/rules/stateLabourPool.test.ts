import { describe, expect, it } from "vitest";
import { buildStateLabourPoolView, effectiveStaffingTightness } from "./stateLabourPool";
import { staffingFactorFromTightness } from "../labourMarket";

const base = {
  laborForce: 1_000_000,
  labourDemand: 2_000_000,
  coverageTightness: 2,
  allocatedTightness: undefined,
  corporateEmployed: undefined,
  demandWageIndex: 1.2,
  wagesEnabled: true,
  sectorWageLevel: 1.5,
};

describe("effectiveStaffingTightness", () => {
  it("uses coverage when the allocation reading is unknown", () => {
    expect(effectiveStaffingTightness(2, undefined)).toBe(2);
  });

  it("takes the larger of the two readings, as the corporation turn does", () => {
    expect(effectiveStaffingTightness(0.6, 1.4)).toBe(1.4);
    expect(effectiveStaffingTightness(3, 1.4)).toBe(3);
    expect(effectiveStaffingTightness(undefined, 1.4)).toBe(1.4);
  });

  it("returns null when neither reading exists", () => {
    expect(effectiveStaffingTightness(undefined, null)).toBeNull();
  });
});

describe("buildStateLabourPoolView", () => {
  it("returns null without a usable labour force or demand", () => {
    expect(buildStateLabourPoolView({ ...base, laborForce: undefined })).toBeNull();
    expect(buildStateLabourPoolView({ ...base, laborForce: 0 })).toBeNull();
    expect(buildStateLabourPoolView({ ...base, labourDemand: Number.NaN })).toBeNull();
  });

  it("reports the pool and the sector's relative bid with the turn's own staffing formula", () => {
    const view = buildStateLabourPoolView(base);
    expect(view).toMatchObject({
      labourForce: 1_000_000,
      labourDemand: 2_000_000,
      tightness: 2,
      stateWageIndex: 1.2,
      sectorRelativeBid: 1.25,
      corporateEmployed: null,
    });
    expect(view?.targetStaffingFactor).toBeCloseTo(staffingFactorFromTightness(2, 1.5, 1.2));
    expect(view?.targetStaffingFactor).toBeCloseTo(0.625);
  });

  it("does not let a state-wide pay rise change any sector's share", () => {
    const before = buildStateLabourPoolView(base);
    const after = buildStateLabourPoolView({
      ...base,
      demandWageIndex: base.demandWageIndex * 1.5,
      sectorWageLevel: base.sectorWageLevel * 1.5,
    });
    expect(after?.targetStaffingFactor).toBeCloseTo(before?.targetStaffingFactor ?? -1);
  });

  it("leaves pay out entirely when wages are off", () => {
    const view = buildStateLabourPoolView({ ...base, wagesEnabled: false });
    expect(view?.sectorRelativeBid).toBeNull();
    expect(view?.stateWageIndex).toBeNull();
    expect(view?.targetStaffingFactor).toBeCloseTo(0.5);
  });

  it("shows hires so far only when the hiring lag, not pool size, binds", () => {
    const lag = buildStateLabourPoolView({
      ...base,
      labourDemand: 600_000,
      coverageTightness: 0.6,
      allocatedTightness: 1.5,
      corporateEmployed: 400_000,
    });
    expect(lag?.tightness).toBe(1.5);
    expect(lag?.corporateEmployed).toBe(400_000);

    const pool = buildStateLabourPoolView({
      ...base,
      allocatedTightness: 1.5,
      corporateEmployed: 900_000,
    });
    expect(pool?.corporateEmployed).toBeNull();
  });

  it("reads slack markets as fully staffable", () => {
    const view = buildStateLabourPoolView({
      ...base,
      labourDemand: 500_000,
      coverageTightness: 0.5,
    });
    expect(view?.targetStaffingFactor).toBe(1);
  });
});
