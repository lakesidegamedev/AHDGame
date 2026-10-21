import { describe, expect, it } from "vitest";
import {
  decommissionGrant,
  idleRetireActive,
  idleRetireSectorShare,
  IDLE_RETIRE_GRACE_TURNS,
  IDLE_RETIRE_PROBE_SHARE,
  IDLE_RETIRE_RATE,
  idleRetireFraction,
} from "./idleRetirementRules";

const base = {
  mothballed: false,
  zeroSalesTurns: IDLE_RETIRE_GRACE_TURNS + 1,
  soldUnits: 0,
  activeUnits: 100,
};

describe("idle capacity retirement on the funded market", () => {
  it("retires nothing inside the grace period", () => {
    expect(idleRetireFraction({ ...base, zeroSalesTurns: IDLE_RETIRE_GRACE_TURNS })).toBe(0);
    expect(idleRetireFraction({ ...base, zeroSalesTurns: undefined })).toBe(0);
  });

  it("retires mothballed capacity once it has sat idle past the grace, like any dead plant", () => {
    expect(idleRetireFraction({ ...base, mothballed: true, activeUnits: 0 })).toBeCloseTo(
      IDLE_RETIRE_RATE * (1 - IDLE_RETIRE_PROBE_SHARE),
      12
    );
    expect(
      idleRetireFraction({ ...base, mothballed: true, zeroSalesTurns: IDLE_RETIRE_GRACE_TURNS })
    ).toBe(0);
  });

  it("retires a share of everything above the probe run once persistently idle", () => {
    expect(idleRetireFraction(base)).toBeCloseTo(
      IDLE_RETIRE_RATE * (1 - IDLE_RETIRE_PROBE_SHARE),
      12
    );
  });

  it("keeps capacity its last sales justify", () => {
    // Sold 50 of 100: justified 60%, so only 40% of the rate applies.
    expect(idleRetireFraction({ ...base, soldUnits: 50 })).toBeCloseTo(IDLE_RETIRE_RATE * 0.4, 12);
  });

  it("is zero without active capacity", () => {
    expect(idleRetireFraction({ ...base, activeUnits: 0 })).toBe(0);
  });
});

describe("retirement gating", () => {
  const inWindow = (turn: number, first: number) => turn >= first && turn < first + 48;

  it("runs only with the stage on and the transition window closed", () => {
    expect(idleRetireActive(1, 100, 100, inWindow)).toBe(false);
    expect(idleRetireActive(1, 100 + 48, 100, inWindow)).toBe(true);
    expect(idleRetireActive(0, 100 + 48, 100, inWindow)).toBe(false);
    expect(idleRetireActive(undefined, 100 + 48, 100, inWindow)).toBe(false);
    expect(idleRetireActive(1, 500, undefined, inWindow)).toBe(false);
  });

  it("needs last turn's receipt", () => {
    const sector = {
      producerZeroSalesTurns: 20,
      producerSettlement: { turn: 9, soldUnits: 0, activeUnits: 100 },
    };
    expect(idleRetireSectorShare(sector, 10)).toBeGreaterThan(0);
    expect(idleRetireSectorShare(sector, 12)).toBe(0);
    expect(idleRetireSectorShare({ producerZeroSalesTurns: 20 }, 10)).toBe(0);
  });
});

describe("decommissioning grant", () => {
  const claims = [
    { sectorId: "a", countryId: "US", claim: 40 },
    { sectorId: "b", countryId: "US", claim: 60 },
    { sectorId: "c", countryId: "GB", claim: 10 },
  ];

  it("pays in full when the pool covers the claims", () => {
    const { payments, coverageByCountry } = decommissionGrant({
      claims,
      poolByCountry: new Map([
        ["US", 100],
        ["GB", 50],
      ]),
    });
    expect(payments.map((p) => p.claim)).toEqual([40, 60, 10]);
    expect(coverageByCountry.get("US")).toBe(1);
  });

  it("scales a country's claims pro rata and never pays more than the pool", () => {
    const { payments } = decommissionGrant({ claims, poolByCountry: new Map([["US", 50]]) });
    const us = payments.filter((p) => p.countryId === "US");
    expect(us.reduce((sum, p) => sum + p.claim, 0)).toBeLessThanOrEqual(50);
    expect(us[0].claim / us[1].claim).toBeCloseTo(40 / 60, 10);
  });

  it("pays nothing from an empty or missing pool", () => {
    expect(decommissionGrant({ claims, poolByCountry: new Map([["US", 0]]) }).payments).toEqual([]);
  });
});
