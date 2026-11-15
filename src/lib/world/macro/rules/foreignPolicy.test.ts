import { describe, expect, it } from "vitest";
import {
  EU_COMMON_TARIFF,
  SANCTION_TURNS,
  STANCE_PULL_MAX,
  TRADE_BALANCE_PRESSURE_MAX,
  aggressorsAgainstPartners,
  chooseGlobalResponse,
  decideWarEntry,
  foreignStance,
  governmentLean,
  planSanctions,
  stanceAlignmentPull,
  stepTariff,
  targetTariffStance,
  tradeBalancePressure,
  type ForeignStance,
} from "./foreignPolicy";

const liberal = foreignStance({ economic: 2, social: -2 });
const nationalist = foreignStance({ economic: 1, social: 4 });
const leftPopulist = foreignStance({ economic: -4, social: 0 });

describe("foreignStance", () => {
  it("reads the government's place on the party grid", () => {
    expect(liberal.protectionism).toBeLessThan(nationalist.protectionism);
    expect(liberal.protectionism).toBeLessThan(leftPopulist.protectionism);
    expect(nationalist.hawkishness).toBeGreaterThan(liberal.hawkishness);
    expect(liberal.orientation).toBeGreaterThan(0);
    expect(nationalist.orientation).toBeLessThan(0);
  });

  it("is centrist with no government", () => {
    expect(foreignStance(null)).toEqual(foreignStance({ economic: 0, social: 0 }));
  });

  it("takes the seat-weighted lean of the governing parties", () => {
    const lean = governmentLean({
      governmentPartyIds: ["a", "b"],
      parties: [
        { partyId: "a", economic: 2, social: 0, seats: 300 },
        { partyId: "b", economic: -2, social: 4, seats: 100 },
        { partyId: "c", economic: -5, social: -5, seats: 200 },
      ] as never,
    });
    expect(lean).toEqual({ economic: 1, social: 1 });
    expect(governmentLean({ governmentPartyIds: [], parties: [] })).toBeNull();
  });
});

describe("stanceAlignmentPull", () => {
  it("pulls a Western-oriented government toward Washington", () => {
    expect(stanceAlignmentPull(liberal, { WASHINGTON: 40 }).WASHINGTON).toBeGreaterThan(0);
  });

  it("erodes Washington in a Western-leaning country under a sovereigntist government", () => {
    const pull = stanceAlignmentPull(nationalist, { WASHINGTON: 50, MOSCOW: 10 });
    expect(pull.WASHINGTON).toBeLessThan(0);
    expect(Math.abs(pull.WASHINGTON!)).toBeLessThanOrEqual(STANCE_PULL_MAX);
  });

  it("pulls an eastern-leaning country toward its own eastern pole", () => {
    expect(stanceAlignmentPull(nationalist, { WASHINGTON: 10, MOSCOW: 50 }).MOSCOW).toBeGreaterThan(
      0
    );
    expect(
      stanceAlignmentPull(nationalist, { WASHINGTON: 10, BEIJING: 30, MOSCOW: 20 }).BEIJING
    ).toBeGreaterThan(0);
  });
});

describe("tariffs", () => {
  it("holds EU members at the common external tariff", () => {
    expect(
      targetTariffStance({ countryId: "FR", stance: nationalist, euMember: true, bloc: "us" })
    ).toEqual({ economyWide: EU_COMMON_TARIFF, targeted: null });
  });

  it("sets a national rate outside the EU and targets the rival leader when hawkish enough", () => {
    const open = targetTariffStance({
      countryId: "TR",
      stance: liberal,
      euMember: false,
      bloc: "us",
    });
    const closed = targetTariffStance({
      countryId: "TR",
      stance: nationalist,
      euMember: false,
      bloc: "us",
    });
    expect(closed.economyWide).toBeGreaterThan(open.economyWide);
    expect(open.targeted).toBeNull();
    expect(closed.targeted?.targetCountryId).toBe("CN");
    const east = targetTariffStance({
      countryId: "RU",
      stance: nationalist,
      euMember: false,
      bloc: "cn",
    });
    expect(east.targeted?.targetCountryId).toBe("US");
    const neutral = targetTariffStance({
      countryId: "BR",
      stance: nationalist,
      euMember: false,
      bloc: "nonAligned",
    });
    expect(neutral.targeted).toBeNull();
  });

  it("moves at most two points a tick", () => {
    expect(stepTariff(null, 12)).toBe(12);
    expect(stepTariff(4, 12)).toBe(6);
    expect(stepTariff(12, 4)).toBe(10);
    expect(stepTariff(11, 12)).toBe(12);
  });
});

describe("sanctions", () => {
  const blocOf = (id: string) => (id === "RU" ? "cn" : id === "BR" ? "nonAligned" : "us");
  const war = { conflictId: "w1", sideA: ["RU"], sideB: ["PL"] };
  const base = {
    countryId: "FI",
    approval: 50,
    bloc: "us" as const,
    blocOf,
    partners: new Set(["PL", "US"]),
    wars: [war],
    existing: [],
    turn: 100,
  };

  it("finds who is at war with a partner, never a partner or itself", () => {
    expect([...aggressorsAgainstPartners("FI", new Set(["PL"]), [war]).keys()]).toEqual(["RU"]);
    expect(aggressorsAgainstPartners("FI", new Set(["PL", "RU"]), [war]).size).toBe(0);
    expect(
      aggressorsAgainstPartners("FI", new Set(["PL"]), [
        { conflictId: "w", sideA: ["RU", "FI"], sideB: ["PL"] },
      ]).size
    ).toBe(0);
  });

  it("sanctions a rival-bloc aggressor against a partner, for a limited time", () => {
    const plan = planSanctions({ ...base, stance: liberal });
    expect(plan.impose).toHaveLength(1);
    expect(plan.impose[0]).toMatchObject({
      targetCountry: "RU",
      expiresTurn: 100 + SANCTION_TURNS,
    });
    expect(plan.impose[0].commodities).toContain("ordnance");
    expect(plan.lift).toEqual([]);
  });

  it("does not sanction without a war against a partner, and a weak dove does not sanction", () => {
    expect(planSanctions({ ...base, stance: liberal, wars: [] }).impose).toEqual([]);
    const dove: ForeignStance = { protectionism: 0.2, hawkishness: 0, orientation: 0.5 };
    expect(planSanctions({ ...base, stance: dove, approval: 20 }).impose).toEqual([]);
  });

  it("renews only when lapsing, and lifts when the war ends or the government turns", () => {
    const active = [{ targetCountry: "RU", commodity: "ordnance" as const, expiresTurn: 120 }];
    expect(planSanctions({ ...base, stance: liberal, existing: active }).impose).toEqual([]);
    const lapsing = [{ targetCountry: "RU", commodity: "ordnance" as const, expiresTurn: 103 }];
    expect(planSanctions({ ...base, stance: liberal, existing: lapsing }).impose).toHaveLength(1);
    expect(planSanctions({ ...base, stance: liberal, existing: active, wars: [] }).lift).toEqual([
      { targetCountry: "RU", reason: "the war that caused it is over" },
    ]);
    const dove: ForeignStance = { protectionism: 0.2, hawkishness: 0, orientation: 0.5 };
    expect(
      planSanctions({ ...base, stance: dove, approval: 20, existing: active }).lift[0].targetCountry
    ).toBe("RU");
  });

  it("escalates commodities with the score", () => {
    const hawk: ForeignStance = { protectionism: 0.5, hawkishness: 1, orientation: 0.5 };
    expect(planSanctions({ ...base, stance: hawk }).impose[0].commodities).toEqual(["all"]);
  });
});

describe("war entry", () => {
  it("never takes a weak government to war", () => {
    const hawk: ForeignStance = { protectionism: 0.5, hawkishness: 1, orientation: 0.5 };
    expect(
      decideWarEntry({
        stance: hawk,
        approval: 35,
        stake: "discretionary",
        intensity: 10,
        partnerOnSide: true,
      }).join
    ).toBe(false);
  });

  it("hawks answer a call, doves and offensive coalitions decline", () => {
    const hawk: ForeignStance = { protectionism: 0.5, hawkishness: 1, orientation: 0.5 };
    const dove: ForeignStance = { protectionism: 0.5, hawkishness: 0.1, orientation: 0.5 };
    expect(
      decideWarEntry({
        stance: hawk,
        approval: 60,
        stake: "discretionary",
        intensity: 20,
        partnerOnSide: true,
      }).join
    ).toBe(true);
    expect(
      decideWarEntry({
        stance: dove,
        approval: 60,
        stake: "discretionary",
        intensity: 20,
        partnerOnSide: true,
      }).join
    ).toBe(false);
    expect(
      decideWarEntry({
        stance: hawk,
        approval: 50,
        stake: "offensive_coalition",
        intensity: 60,
        partnerOnSide: false,
      }).join
    ).toBe(false);
  });
});

describe("chooseGlobalResponse", () => {
  const options = [
    { optionId: "stay_out", participation: 0, requiresBudget: false },
    { optionId: "aid", participation: 2, requiresBudget: false },
    { optionId: "deploy", participation: 5, requiresBudget: false },
    { optionId: "fund", participation: 9, requiresBudget: true },
  ];
  it("hawks commit most, doves least, others take the default", () => {
    const hawk: ForeignStance = { protectionism: 0.5, hawkishness: 0.9, orientation: 0 };
    const dove: ForeignStance = { protectionism: 0.5, hawkishness: 0.2, orientation: 0 };
    const middle: ForeignStance = { protectionism: 0.5, hawkishness: 0.5, orientation: 0 };
    expect(
      chooseGlobalResponse({ stance: hawk, approval: 50, options, defaultOptionId: "aid" })
    ).toBe("deploy");
    expect(
      chooseGlobalResponse({ stance: dove, approval: 50, options, defaultOptionId: "aid" })
    ).toBe("stay_out");
    expect(
      chooseGlobalResponse({ stance: middle, approval: 50, options, defaultOptionId: "aid" })
    ).toBe("aid");
    expect(
      chooseGlobalResponse({ stance: hawk, approval: 20, options, defaultOptionId: "aid" })
    ).toBe("aid");
    expect(
      chooseGlobalResponse({ stance: hawk, approval: 50, options: [], defaultOptionId: null })
    ).toBeNull();
  });
});

describe("tradeBalancePressure", () => {
  it("is positive for a surplus, negative for a deficit, scaled by openness", () => {
    const surplus = tradeBalancePressure({
      soldValue: 300,
      boughtValue: 100,
      tradeExposure: 0.4,
      prior: null,
    });
    expect(surplus).toBeCloseTo(0.2, 6);
    const deficit = tradeBalancePressure({
      soldValue: 100,
      boughtValue: 300,
      tradeExposure: 0.4,
      prior: null,
    });
    expect(deficit).toBeCloseTo(-0.2, 6);
    expect(
      tradeBalancePressure({ soldValue: 0, boughtValue: 0, tradeExposure: 1, prior: null })
    ).toBe(0);
  });

  it("smooths across ticks and stays bounded", () => {
    expect(
      tradeBalancePressure({ soldValue: 300, boughtValue: 100, tradeExposure: 0.4, prior: 0 })
    ).toBeCloseTo(0.1, 6);
    expect(
      Math.abs(tradeBalancePressure({ soldValue: 1, boughtValue: 0, tradeExposure: 5, prior: 1 }))
    ).toBeLessThanOrEqual(TRADE_BALANCE_PRESSURE_MAX);
  });
});
