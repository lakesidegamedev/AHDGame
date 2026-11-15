import { describe, expect, it } from "vitest";
import {
  agreementTransition,
  planSupply,
  type BasingAgreement,
  type SupplyContext,
} from "./supply";
import type { NavairUnit } from "../types";
import { navalDistance, isWaterAccessible } from "../map";

const context: SupplyContext = { blocs: {}, enemies: { US: ["JP"], JP: ["US"] }, agreements: [] };
const unit = (patch: Partial<NavairUnit> = {}) =>
  ({
    countryId: "US",
    station: "nat",
    domain: "naval",
    type: "Guided-Missile Destroyer",
    integrity: 100,
    ...patch,
  }) as NavairUnit;
const agreement = (patch: Partial<BasingAgreement> = {}): BasingAgreement => ({
  _id: "CN:US:air",
  host: "CN",
  guest: "US",
  domain: "air",
  status: "active",
  updatedTurn: 1,
  ...patch,
});

describe("naval and air supply", () => {
  it("uses North American home ports for ships operating in the Atlantic", () => {
    const fleet = Array.from({ length: 26 }, () => unit());
    const advice = planSupply(fleet, context);
    expect(advice[0]).toMatchObject({
      base: "noa",
      capacity: 27,
      demand: 26,
      crowdingPenalty: 0,
      supply: 77,
      access: "Home",
    });
    expect(isWaterAccessible("noa")).toBe(false);
  });
  it("crosses the Pacific without changing ground geography", () => {
    expect(navalDistance("noa", "wpa")).toBe(1);
    expect(navalDistance("noa", "eas")).toBe(2);
  });
  it("does not apply fleet overcrowding to aircraft", () => {
    const roster = [
      ...Array.from({ length: 40 }, () => unit()),
      unit({ domain: "air", type: "Fighter Wing" }),
    ];
    const advice = planSupply(roster, context);
    expect(advice[0].crowdingPenalty).toBeGreaterThan(0);
    expect(advice.at(-1)).toMatchObject({ supply: 77, crowdingPenalty: 0 });
  });
  it("Airlift reaches adjacent stations, does not stack, and excludes destroyed wings", () => {
    const fighter = unit({ domain: "air", type: "Fighter Wing", station: "eas" });
    const lift = unit({ domain: "air", type: "Airlift Wing", station: "wpa", mission: "AIRLIFT" });
    expect(planSupply([fighter, lift, lift], context)[0].airliftBonus).toBe(25);
    expect(planSupply([fighter, { ...lift, integrity: 0 }], context)[0].airliftBonus).toBe(0);
    expect(planSupply([fighter, { ...lift, countryId: "UK" }], context)[0].airliftBonus).toBe(0);
    expect(planSupply([fighter, { ...lift, type: "Fighter Wing" }], context)[0].airliftBonus).toBe(
      0
    );
  });
  it("uses accepted airbases without making the whole mixed region hostile", () => {
    const fighter = unit({ domain: "air", type: "Fighter Wing", station: "eas" });
    expect(planSupply([fighter], { ...context, agreements: [agreement()] })[0]).toMatchObject({
      base: "eas",
      access: "Agreed access",
      supply: 94,
    });
    expect(
      planSupply([fighter], { ...context, agreements: [agreement({ status: "offered" })] })[0]
        .hostilePenalty
    ).toBe(17);
    expect(
      planSupply([fighter], { ...context, agreements: [agreement({ host: "JP" })] })[0]
        .hostilePenalty
    ).toBe(17);
  });
  it("does not infer basing consent from an alliance", () => {
    const fighter = unit({ domain: "air", station: "weu" });
    expect(
      planSupply([fighter], { ...context, blocs: { US: "west", UK: "west" } })[0].access
    ).not.toBe("Agreed access");
  });
  it("shares physical port capacity across guests and host without duplicating it", () => {
    const roster = [
      ...Array.from({ length: 20 }, () => unit({ station: "eas" })),
      ...Array.from({ length: 20 }, () => unit({ countryId: "CN", station: "eas" })),
    ];
    const advice = planSupply(roster, { ...context, agreements: [agreement({ domain: "naval" })] });
    expect(advice[0]).toMatchObject({ demand: 40, capacity: 20.25, crowdingPenalty: 78 });
    expect(advice[20]).toMatchObject({ demand: 40, capacity: 27, crowdingPenalty: 78 });
  });
  it("does not mix an enemy's home ports with a friendly host in the same strategic region", () => {
    const advice = planSupply(
      [
        unit({ station: "eas" }),
        ...Array.from({ length: 26 }, () => unit({ countryId: "JP", station: "eas" })),
      ],
      { ...context, agreements: [agreement({ domain: "naval" })] }
    );
    expect(advice[0]).toMatchObject({ host: "CN", demand: 1, crowdingPenalty: 0 });
    expect(advice[1]).toMatchObject({ host: "JP", demand: 26, crowdingPenalty: 0 });
  });
  it("supports home ports for other countries too", () => {
    expect(planSupply([unit({ countryId: "UK", station: "nat" })], context)[0].base).toBe("weu");
    expect(planSupply([unit({ countryId: "JP", station: "eas" })], context)[0].base).toBe("eas");
  });
});

describe("bilateral access", () => {
  it("requires a host offer and guest acceptance and allows either party to revoke", () => {
    const offered = agreementTransition(null, "CN", "CN", "US", "air", "offer", 1, []);
    expect(offered.status).toBe("offered");
    expect(() => agreementTransition(offered, "CN", "CN", "US", "air", "accept", 2, [])).toThrow();
    const active = agreementTransition(offered, "US", "CN", "US", "air", "accept", 2, []);
    expect(active.status).toBe("active");
    for (const actor of ["CN", "US"] as const)
      expect(agreementTransition(active, actor, "CN", "US", "air", "revoke", 3, []).status).toBe(
        "revoked"
      );
  });
  it("rejects third parties, self agreements, absent offers and enemies", () => {
    expect(() => agreementTransition(null, "JP", "CN", "US", "air", "offer", 1, [])).toThrow();
    expect(() => agreementTransition(null, "US", "US", "US", "air", "offer", 1, [])).toThrow();
    expect(() => agreementTransition(null, "US", "CN", "US", "air", "accept", 1, [])).toThrow();
    expect(() => agreementTransition(null, "CN", "CN", "US", "air", "offer", 1, ["US"])).toThrow();
  });
});
