import { describe, expect, it } from "vitest";
import { createCrisisInstance } from "./instance";
import {
  MAX_FEED_STEP,
  allianceWeights,
  applyFeed,
  delayedSeverity,
  evaluateSpillover,
  linkPressure,
  sourceAmplifier,
  spilloverSpreadLinks,
  tradeWeights,
  type SpilloverWorld,
} from "./spillover";
import { makeDefinition } from "./testFixtures";
import type { CrisisDefinition, CrisisInstance, SpilloverLink } from "./types";

const LINK: SpilloverLink = {
  id: "trade-shock",
  channel: "trade",
  targetDefinitionId: "target",
  minSeverity: 40,
  transmission: 0.5,
};

function world(overrides: Partial<SpilloverWorld> = {}): SpilloverWorld {
  return {
    weights: {
      trade: new Map([
        [
          "DE",
          new Map([
            ["UK", 0.8],
            ["JP", 0.02],
          ]),
        ],
      ]),
    },
    sizeShare: new Map(),
    tiers: new Map([
      ["DE", "npp"],
      ["UK", "npp"],
      ["JP", "npp"],
    ]),
    ...overrides,
  };
}

function source(severity: number, patch: Partial<CrisisInstance> = {}): CrisisInstance {
  return {
    ...createCrisisInstance(makeDefinition({ id: "source" }), 0),
    stage: "peak",
    severity,
    ...patch,
  };
}

function defs(link: SpilloverLink = LINK): Map<string, CrisisDefinition> {
  return new Map([
    ["source", makeDefinition({ id: "source", spillover: [link] })],
    ["target", makeDefinition({ id: "target", scope: "national" })],
  ]);
}

describe("link weight math", () => {
  it("scales source severity by transmission and channel weight", () => {
    expect(linkPressure(world(), LINK, source(80), 10, "DE", "UK")).toBeCloseTo(80 * 0.5 * 0.8);
  });

  it("passes nothing below the severity gate or the weight floor", () => {
    expect(linkPressure(world(), LINK, source(30), 10, "DE", "UK")).toBe(0);
    expect(linkPressure(world(), LINK, source(80), 10, "DE", "JP")).toBe(0);
  });

  it("holds until the source reaches the required stage", () => {
    const staged = { ...LINK, minStage: "peak" as const };
    expect(linkPressure(world(), staged, source(80, { stage: "onset" }), 10, "DE", "UK")).toBe(0);
    expect(linkPressure(world(), staged, source(80), 10, "DE", "UK")).toBeGreaterThan(0);
  });

  it("amplifies by background source size and leaves full-simulation sources alone", () => {
    const big = world({
      sizeShare: new Map([["DE", 1]]),
      tiers: new Map([["DE", "background"]]),
    });
    expect(sourceAmplifier(big, "DE")).toBe(2);
    expect(sourceAmplifier(world(), "DE")).toBe(1);
    expect(linkPressure(big, LINK, source(40), 10, "DE", "UK")).toBeCloseTo(40 * 0.5 * 0.8 * 2);
  });

  it("derives trade weight from the share of a country's trade a partner supplies", () => {
    const flow = new Map([
      ["DE", new Map([["UK", 60]])],
      ["FR", new Map([["UK", 20]])],
    ]);
    const weights = tradeWeights(flow, 1);
    expect(weights.get("DE")?.get("UK")).toBeCloseTo(0.75);
    expect(weights.get("FR")?.get("UK")).toBeCloseTo(0.25);
  });

  it("derives alliance weight from shared memberships", () => {
    const weights = allianceWeights(
      new Map([
        ["DE", new Set(["nato", "eu"])],
        ["UK", new Set(["nato", "g7"])],
      ])
    );
    expect(weights.get("DE")?.get("UK")).toBeCloseTo(0.5);
  });
});

describe("delay", () => {
  const instance = source(60, {
    startTurn: 10,
    severityHistory: [
      { turn: 10, severity: 20 },
      { turn: 11, severity: 35 },
      { turn: 12, severity: 50 },
      { turn: 13, severity: 60 },
    ],
  });

  it("reads severity as it stood delayTurns ago", () => {
    expect(delayedSeverity(instance, 13, 2)).toBe(35);
    expect(delayedSeverity(instance, 13, 0)).toBe(60);
  });

  it("waits while the crisis is younger than the delay", () => {
    expect(delayedSeverity(instance, 13, 5)).toBeNull();
    const delayed = { ...LINK, delayTurns: 5 };
    expect(linkPressure(world(), delayed, instance, 13, "DE", "UK")).toBe(0);
  });

  it("gates on the delayed severity, not today's", () => {
    const delayed = { ...LINK, delayTurns: 3 };
    expect(linkPressure(world(), delayed, instance, 13, "DE", "UK")).toBe(0);
    expect(linkPressure(world(), delayed, instance, 15, "DE", "UK")).toBeGreaterThan(0);
  });
});

describe("feed versus open", () => {
  const sourceCrisis = { id: "a", countryIds: ["DE"], instance: source(80) };

  it("proposes opening the target definition when no linked crisis exists", () => {
    const actions = evaluateSpillover({
      turn: 10,
      world: world(),
      definitions: defs(),
      crises: [sourceCrisis],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      kind: "open",
      targetCountry: "UK",
      targetDefinitionId: "target",
    });
  });

  it("feeds an existing linked crisis instead of opening a second", () => {
    const existing = {
      id: "b",
      countryIds: ["UK"],
      instance: {
        ...createCrisisInstance(makeDefinition({ id: "target" }), 5),
        severity: 10,
      },
    };
    const actions = evaluateSpillover({
      turn: 10,
      world: world(),
      definitions: defs(),
      crises: [sourceCrisis, existing],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "feed", targetId: "b", sourceId: "a" });
  });

  it("does not feed a crisis already above the pressure, or an ancestor", () => {
    const high = {
      id: "b",
      countryIds: ["UK"],
      instance: { ...createCrisisInstance(makeDefinition({ id: "target" }), 5), severity: 90 },
    };
    expect(
      evaluateSpillover({
        turn: 10,
        world: world(),
        definitions: defs(),
        crises: [sourceCrisis, high],
      })
    ).toHaveLength(0);

    const child = {
      id: "c",
      countryIds: ["UK"],
      instance: {
        ...source(80),
        parents: [{ crisisId: "b", definitionId: "target", linkId: "x" }],
      },
    };
    const ancestor = {
      id: "b",
      countryIds: ["DE"],
      instance: { ...createCrisisInstance(makeDefinition({ id: "target" }), 5), severity: 5 },
    };
    const back = new Map(defs());
    back.set(
      "source",
      makeDefinition({ id: "source", spillover: [{ ...LINK, targetDefinitionId: "target" }] })
    );
    const w = world({
      weights: { trade: new Map([["UK", new Map([["DE", 0.9]])]]) },
    });
    const actions = evaluateSpillover({
      turn: 10,
      world: w,
      definitions: back,
      crises: [child, ancestor],
    });
    expect(actions).toHaveLength(0);
  });

  it("applies feeds in bounded steps toward the pressure", () => {
    expect(applyFeed(10, 50)).toBe(10 + MAX_FEED_STEP);
    expect(applyFeed(48, 50)).toBe(50);
    expect(applyFeed(60, 50)).toBe(60);
  });
});

describe("board parent links", () => {
  it("draws a line for each recorded parent between live crises only", () => {
    const links = spilloverSpreadLinks([
      { id: "a", parents: [] },
      { id: "b", parents: [{ crisisId: "a" }] },
      { id: "c", parents: [{ crisisId: "gone" }] },
    ]);
    expect(links).toEqual([{ fromId: "a", toId: "b", via: "spillover" }]);
  });
});
