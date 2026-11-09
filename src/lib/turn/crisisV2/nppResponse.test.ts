import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import type { CrisisInstance } from "@/lib/crises/v2/types";
import { registerCrisisDefinition, resetCrisisV2RegistryForTests } from "./registry";

const commitLeverUse = vi.hoisted(() => vi.fn());
const tiers = vi.hoisted(() => ({
  map: new Map<string, string>(),
}));

vi.mock("@/lib/crises/levers/leverCommand", () => ({ commitLeverUse }));
vi.mock("@/lib/country/countryTier", () => ({
  loadCountryTiers: async () => ({
    tierOf: (id: string) => tiers.map.get(id) ?? "absent",
    registeredIds: [...tiers.map.keys()],
    backgroundIds: [...tiers.map].filter(([, t]) => t === "background").map(([id]) => id),
  }),
}));
vi.mock("@/lib/era/context", () => ({ getEraContext: async () => ({ preset: null, year: 2030 }) }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
vi.mock("./holderProviders", () => ({
  officeHolderProvider: { id: "offices", load: async () => new Map() },
}));

import { runNppCrisisResponse } from "./nppResponse";

interface Doc {
  _id: ObjectId;
  scope: string;
  countryIds: string[];
  regionIds: string[];
  v2: CrisisInstance;
}

function makeDb(docs: Doc[]) {
  const head = new ObjectId();
  const rows: Record<string, unknown[]> = {
    crises: docs,
    governmentFormations: ["UK", "JP", "BG"].map((id) => ({
      _id: id,
      status: "formed",
      pmNppId: head,
    })),
    npps: [{ _id: head, personality: { loyalty: 50, ambition: 80, stubbornness: 20 } }],
    federalBudget: ["UK", "JP", "BG"].map((countryId) => ({
      countryId,
      treasuryBalance: 100_000,
      gdp: 1_000_000,
    })),
    governmentApprovals: ["UK", "JP", "BG"].map((id) => ({ _id: id, approvalRating: 60 })),
    crisisLeverUses: [],
  };
  return {
    collection(name: string) {
      return {
        find: () => ({ toArray: async () => rows[name] ?? [] }),
      };
    },
  };
}

function crisis(countryIds: string[], severity: number): Doc {
  const def = makeDefinition({ id: "shock" });
  return {
    _id: new ObjectId(),
    scope: "country",
    countryIds,
    regionIds: [],
    v2: { ...createCrisisInstance(def, 1), stage: "peak", severity },
  };
}

describe("NPP crisis response shell", () => {
  beforeEach(() => {
    resetCrisisV2RegistryForTests();
    registerCrisisDefinition(makeDefinition({ id: "shock" }));
    commitLeverUse.mockReset();
    commitLeverUse.mockResolvedValue({ ok: true, useId: new ObjectId(), cost: {}, uncharged: {} });
    tiers.map = new Map([
      ["UK", "npp"],
      ["JP", "npp"],
      ["BG", "background"],
      ["US", "player"],
    ]);
  });

  it("pulls levers for NPP countries through the lever command", async () => {
    const result = await runNppCrisisResponse(makeDb([crisis(["UK"], 80)]) as never, 20);
    expect(result.pulled).toBeGreaterThan(0);
    const args = commitLeverUse.mock.calls[0][1];
    expect(args.countryId).toBe("UK");
    expect(args.turn).toBe(20);
  });

  it("never pulls for background or player-run countries", async () => {
    const result = await runNppCrisisResponse(
      makeDb([crisis(["BG"], 95), crisis(["US"], 95)]) as never,
      20
    );
    expect(result.pulled).toBe(0);
    expect(commitLeverUse).not.toHaveBeenCalled();
  });

  it("bounds pulls per turn", async () => {
    const docs = Array.from({ length: 20 }, () => crisis(["UK", "JP"], 95));
    const result = await runNppCrisisResponse(makeDb(docs) as never, 20);
    expect(result.pulled).toBeLessThanOrEqual(12);
  });
});
