import { describe, it, expect } from "vitest";
import { getResearchableDecades, getDecadeForYear, TECH_DECADES } from "./decades";
import { TECH_TREE, corpNodeId, sectorNodeId } from "./nodes";
import {
  techNodeCashCost,
  techNodeCashFloorAnchor,
  techNodeValuePerTurn,
  TECH_NODE_CASH_FLOOR_ANCHOR,
  TECH_NODE_PAYBACK_TURNS,
  TECH_NODE_VALUED_FLOOR_FRACTION,
} from "./costs";
import {
  canUnlock,
  getCommittedLane,
  getActiveTechEffects,
  getAggregatedTechEffects,
  getUnlockedStrategyIds,
  autoGrantedNodeIds,
  getDecadeLaneNodes,
  getNodePrereqId,
  getSectorTechEffects,
  getActiveTechDecadeIds,
  isTechNodeEffectExpired,
  SLOT_PARENT,
  type TechCorpView,
} from "./selectors";

const FUNDS = { rdScore: 999, cashAvailable: 1e12, cashCost: 0 };

describe("decades", () => {
  it("returns current decade onward as researchable", () => {
    expect(getResearchableDecades(2020).map((d) => d.id)).toEqual(["2019", "2029"]);
    expect(getDecadeForYear(1995).id).toBe("1989");
  });
});

describe("tree shape (v3 lanes)", () => {
  it("gives every sector 15 corporate nodes per decade", () => {
    for (const decade of TECH_DECADES) {
      const count = getDecadeLaneNodes("retail", decade.id, "generic").length;
      expect(count, `retail corporate ${decade.id}`).toBe(15);
    }
  });
  it("authors a full sector lane for every decade", () => {
    for (const decade of TECH_DECADES) {
      const count = getDecadeLaneNodes("energy", decade.id, "sector").length;
      expect(count, `energy sector ${decade.id}`).toBe(15);
    }
  });
  it("every sector now has an authored sector lane", () => {
    expect(TECH_TREE.retail.some((n) => n.lane === "sector")).toBe(true);
  });
  it("early manufacturing sector keeps both fork sides (ticket-1016)", () => {
    const slots = getDecadeLaneNodes("manufacturing", "1950", "sector").map((n) => n.slot);
    expect(slots).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});

describe("autoGrantedNodeIds", () => {
  it("grants both generic and sector nodes for all passed decades", () => {
    const ids = autoGrantedNodeIds("energy", 2020); // current decade 2019 → 1940..2009 passed
    expect(ids).toContain(corpNodeId("1940", 1));
    expect(ids).toContain(corpNodeId("1979", 1));
    expect(ids).toContain(corpNodeId("2009", 9));
    expect(ids).toContain(sectorNodeId("energy", "1979", 1));
    expect(ids).not.toContain(corpNodeId("2019", 1));
    expect(ids).not.toContain(sectorNodeId("energy", "2019", 1));
    // 4 early decades × (9 generic + 9 sector) + 4 playable past × (9 + 9) = 72 + 72 = 144
    expect(ids).toHaveLength(144);
  });
  it("grants nothing for the earliest era", () => {
    expect(autoGrantedNodeIds("energy", 1942)).toHaveLength(0); // 1940 is current, nothing passed
  });
});

describe("canUnlock (v2)", () => {
  const corp: TechCorpView = { type: "energy", unlockedTechNodeIds: [] };

  it("allows a reached, affordable node", () => {
    expect(canUnlock(corp, corpNodeId("2019", 1), 2020, FUNDS).ok).toBe(true);
  });
  it("blocks a future decade", () => {
    expect(canUnlock(corp, corpNodeId("2029", 1), 2020, FUNDS)).toMatchObject({
      ok: false,
      reason: "decade-locked",
    });
  });
  it("blocks the other lane once committed", () => {
    const committed: TechCorpView = {
      type: "energy",
      unlockedTechNodeIds: [sectorNodeId("energy", "2019", 1)],
      techDecadeLane: { "2019": "sector" },
    };
    expect(canUnlock(committed, corpNodeId("2019", 1), 2020, FUNDS)).toMatchObject({
      ok: false,
      reason: "lane-locked",
    });
  });
  it("allows more nodes within the committed lane", () => {
    const committed: TechCorpView = {
      type: "energy",
      unlockedTechNodeIds: [sectorNodeId("energy", "2019", 1)],
      techDecadeLane: { "2019": "sector" },
    };
    expect(canUnlock(committed, sectorNodeId("energy", "2019", 2), 2020, FUNDS).ok).toBe(true);
  });
  it("blocks an already-owned node", () => {
    const owned: TechCorpView = {
      type: "energy",
      unlockedTechNodeIds: [corpNodeId("2019", 1)],
      techDecadeLane: { "2019": "generic" },
    };
    expect(canUnlock(owned, corpNodeId("2019", 1), 2020, FUNDS)).toMatchObject({
      ok: false,
      reason: "already-owned",
    });
  });
  it("blocks on insufficient rdScore", () => {
    expect(canUnlock(corp, corpNodeId("2019", 1), 2020, { ...FUNDS, rdScore: 0 })).toMatchObject({
      ok: false,
      reason: "insufficient-rd",
    });
  });
  it("blocks on insufficient cash", () => {
    expect(
      canUnlock(corp, corpNodeId("2019", 1), 2020, {
        rdScore: 999,
        cashAvailable: 10,
        cashCost: 100,
      })
    ).toMatchObject({ ok: false, reason: "insufficient-cash" });
  });
  it("blocks an unknown node", () => {
    expect(canUnlock(corp, "not-real", 2020, FUNDS)).toMatchObject({
      ok: false,
      reason: "unknown-node",
    });
  });

  it("enforces tree order — a child needs its parent first", () => {
    // slot 2 needs slot 1; slot 4 needs slot 2.
    const committed: TechCorpView = {
      type: "energy",
      unlockedTechNodeIds: [corpNodeId("2019", 1)],
      techDecadeLane: { "2019": "generic" },
    };
    expect(canUnlock(committed, corpNodeId("2019", 2), 2020, FUNDS).ok).toBe(true);
    expect(canUnlock(committed, corpNodeId("2019", 4), 2020, FUNDS)).toMatchObject({
      ok: false,
      reason: "prereq-missing",
    });
  });

  it("maps slot topology to the right parent node id", () => {
    expect(SLOT_PARENT[1]).toBeNull();
    expect(getNodePrereqId(TECH_TREE.energy.find((n) => n.id === corpNodeId("2019", 4))!)).toBe(
      corpNodeId("2019", 2)
    );
    expect(
      getNodePrereqId(TECH_TREE.energy.find((n) => n.id === corpNodeId("2019", 1))!)
    ).toBeNull();
  });
});

describe("committed lane + effects", () => {
  it("infers committed lane from unlocked nodes when map absent", () => {
    const corp: TechCorpView = { type: "energy", unlockedTechNodeIds: [corpNodeId("1999", 3)] };
    expect(getCommittedLane(corp, "1999")).toBe("generic");
    expect(getCommittedLane(corp, "2009")).toBeUndefined();
  });
  it("aggregates plant effects from unlocked nodes", () => {
    const corp: TechCorpView = { type: "energy", unlockedTechNodeIds: [corpNodeId("2019", 1)] };
    expect(getActiveTechEffects(corp).length).toBeGreaterThan(0);
    expect(getAggregatedTechEffects(corp).plantOutputBonus).toBeCloseTo(0.02); // RPA = +2% output
  });
  it("surfaces unlocked production methods", () => {
    const corp: TechCorpView = {
      type: "energy",
      unlockedTechNodeIds: [sectorNodeId("energy", "1979", 5)], // Nuclear Program
    };
    expect(getUnlockedStrategyIds(corp)).toContain("nuclear");
  });

  it("scopes effects: sector lane = primary only (full), corp lane = all (halved)", () => {
    // energy-2019-1 (sector, -10.5% inputs) + corp-2019-1 (generic, +2% output).
    const corp: TechCorpView = {
      type: "energy",
      unlockedTechNodeIds: [sectorNodeId("energy", "2019", 1), corpNodeId("2019", 1)],
    };
    // Primary (energy) sector: corp output halved to 1%, sector inputs at full strength.
    expect(getSectorTechEffects(corp, "energy").plantOutputBonus).toBeCloseTo(0.01);
    expect(getSectorTechEffects(corp, "energy").inputEfficiencyBonus).toBeCloseTo(0.105);
    // A non-primary sector: only the corp lane, halved; no sector bonus.
    expect(getSectorTechEffects(corp, "retail").plantOutputBonus).toBeCloseTo(0.01);
    expect(getSectorTechEffects(corp, "retail").inputEfficiencyBonus).toBe(0);
  });
});

describe("tech effect expiry", () => {
  it("keeps the current and previous decade active", () => {
    expect([...getActiveTechDecadeIds(1996)].sort()).toEqual(["1979", "1989"]);
  });

  it("marks an old node with a running plant effect as expired", () => {
    const base = TECH_TREE.energy.find((n) => n.id === corpNodeId("2019", 1))!;
    const running = {
      ...base,
      decadeId: "1969",
      effects: [{ kind: "laborCostReduction" as const, pct: 0.1 }],
    };
    const strategyOnly = {
      ...base,
      decadeId: "1969",
      effects: [{ kind: "unlockStrategy" as const, strategyId: "x" }],
    };
    const active = getActiveTechDecadeIds(1996);
    expect(isTechNodeEffectExpired(running, active)).toBe(true);
    expect(isTechNodeEffectExpired({ ...running, decadeId: "1979" }, active)).toBe(false);
    expect(isTechNodeEffectExpired(strategyOnly as typeof base, active)).toBe(false);
  });
});

describe("cash cost", () => {
  it("scales with daily gross revenue and the node fraction", () => {
    const node = TECH_TREE.energy.find((n) => n.id === corpNodeId("2019", 1))!;
    expect(techNodeCashCost(node, 100_000)).toBe(5_000); // default 0.05
    expect(techNodeCashCost(node, 0)).toBe(0);
  });

  it("charges at least the floor so zero-revenue corps still pay cash (#1506)", () => {
    const node = TECH_TREE.energy.find((n) => n.id === corpNodeId("2019", 1))!;
    expect(techNodeCashCost(node, 0, 5_000_000)).toBe(5_000_000);
    expect(techNodeCashCost(node, 10_000_000, 5_000_000)).toBe(5_000_000);
    // Without a plant basis, large corps are priced off revenue.
    expect(techNodeCashCost(node, 550_000_000, 5_000_000)).toBe(27_500_000);
    expect(techNodeCashCost(node, 0, Number.NaN)).toBe(0);
    expect(techNodeCashCost(node, 0, -1)).toBe(0);
  });

  it("prices a valued node at one game year of what it earns this corp", () => {
    // corp-2019-1 is a Corporate-lane node (+2% plant output, −10% labour):
    // half strength on every sector. Output is valued on contribution
    // (revenue minus inputs), labour on the labour bill.
    const node = TECH_TREE.energy.find((n) => n.id === corpNodeId("2019", 1))!;
    const basis = {
      primary: { revenue: 1_000_000, inputs: 300_000, labour: 200_000 },
      all: { revenue: 2_000_000, inputs: 600_000, labour: 400_000 },
    };
    const value = techNodeValuePerTurn(node, basis);
    expect(value).toBeCloseTo(0.5 * (0.02 * 1_400_000 + 0.1 * 400_000));
    expect(techNodeCashCost(node, 48_000_000, 0, basis)).toBe(
      Math.round(value * TECH_NODE_PAYBACK_TURNS)
    );
    // A valued node only needs a tenth of the floor, so a mid-size corp still
    // pays value x 48 instead of the flat minimum.
    expect(techNodeCashCost(node, 0, 5_000_000, basis)).toBe(
      Math.round(value * TECH_NODE_PAYBACK_TURNS)
    );
    // A tiny corp whose node value is near zero still pays the reduced floor.
    const tiny = {
      primary: { revenue: 1_000, inputs: 300, labour: 200 },
      all: { revenue: 2_000, inputs: 600, labour: 400 },
    };
    expect(techNodeCashCost(node, 0, 5_000_000, tiny)).toBe(
      5_000_000 * TECH_NODE_VALUED_FLOOR_FRACTION
    );
  });

  it("values a Sector-lane labour node on the primary sector only", () => {
    const node = {
      ...TECH_TREE.energy.find((n) => n.id === corpNodeId("2019", 1))!,
      lane: "sector" as const,
      effects: [{ kind: "laborCostReduction" as const, pct: 0.1 }],
    };
    const basis = {
      primary: { revenue: 1_000_000, inputs: 300_000, labour: 200_000 },
      all: { revenue: 2_000_000, inputs: 600_000, labour: 400_000 },
    };
    expect(techNodeValuePerTurn(node, basis)).toBeCloseTo(20_000);
  });

  it("scales the floor with the world era", () => {
    expect(techNodeCashFloorAnchor(1)).toBe(TECH_NODE_CASH_FLOOR_ANCHOR);
    expect(techNodeCashFloorAnchor(0.04)).toBeCloseTo(200_000);
    expect(techNodeCashFloorAnchor(Number.NaN)).toBe(TECH_NODE_CASH_FLOOR_ANCHOR);
  });
});

describe("v3 specializations (selectors)", () => {
  const type = "financial" as const;
  const idOf = (s: number) => `${type}-1950-${s}`;
  const baseline = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(idOf);
  const funds = { rdScore: 10_000, cashAvailable: Infinity, cashCost: 0 };
  const year = 1956;

  it("finishing either branch opens all three entries; picking one path-locks the rest", () => {
    const corp = {
      type,
      unlockedTechNodeIds: baseline,
      techDecadeLane: { "1950": "sector" as const },
    };
    for (const slot of [10, 11, 12]) {
      expect(canUnlock(corp, idOf(slot), year, funds).ok, `slot ${slot}`).toBe(true);
    }
    const chosen = { ...corp, unlockedTechNodeIds: [...baseline, idOf(10)] };
    expect(canUnlock(chosen, idOf(11), year, funds)).toMatchObject({
      ok: false,
      reason: "path-locked",
    });
    expect(canUnlock(chosen, idOf(12), year, funds)).toMatchObject({
      ok: false,
      reason: "path-locked",
    });
    // The chosen path's capstone is open; rival capstones fail on prereq.
    expect(canUnlock(chosen, idOf(13), year, funds).ok).toBe(true);
    expect(canUnlock(chosen, idOf(14), year, funds)).toMatchObject({
      ok: false,
      reason: "prereq-missing",
    });
  });

  it("one completed branch is enough (any-of prereq on entries)", () => {
    const oneBranch = [1, 2, 4, 6, 8].map(idOf);
    const corp = {
      type,
      unlockedTechNodeIds: oneBranch,
      techDecadeLane: { "1950": "sector" as const },
    };
    expect(canUnlock(corp, idOf(10), year, funds).ok).toBe(true);
  });

  it("auto-granted past decades never include specializations or capstones", () => {
    const ids = autoGrantedNodeIds(type, 2035);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(Number(id.replace(/^.*-(\d+)$/, "$1")), id).toBeLessThanOrEqual(9);
    }
  });
});
