import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { validateCrisisDefinition } from "@/lib/crises/v2/definition";
import {
  createEffectRegistry,
  evaluateEffectModules,
  type EffectContext,
} from "@/lib/crises/v2/effectModule";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { nextStage } from "@/lib/crises/v2/stageMachine";
import {
  getCrisisDefinition,
  getCrisisEffectRegistry,
  getCrisisInputProvider,
  resetCrisisV2RegistryForTests,
} from "@/lib/turn/crisisV2/registry";
import { ensureLegacyCrisisContent } from "@/lib/turn/crisisV2/legacyContent";
import {
  ensureCampaignCrisisContent,
  isCampaignCrisis,
  resetCampaignCrisisContentForTests,
  syncCampaignCrises,
} from "./campaignCrisis";
import { allLivingConflictDefs, LIVING_CONFLICT_DEFS } from "./registry";
import {
  CAMPAIGN_SPILLOVER,
  campaignDefinitionId,
  campaignIntensityInput,
  campaignRuleRefs,
  convertLivingConflictDef,
} from "./rules/crisisV2";
import {
  YUGOSLAV_ESCALATION_CIVILIAN_LOSS,
  requestedConflictCivilianLoss,
} from "./rules/civilianLoss";
import {
  YUGOSLAV_ESCALATION_CAPACITY_DESTRUCTION,
  planCapacityDestruction,
} from "./rules/capacityDestruction";
import { waveFamilyKeys } from "./rules/waveFamilyTables";
import { YUGOSLAV_REFUGEE_RECEPTION } from "./rules/refugeeReception";
import { planCrisisSanctions } from "../livingConflict/sanctions/rules";
import { vietnamWorldPressure } from "./worldPressure";

beforeEach(() => {
  resetCrisisV2RegistryForTests();
  resetCampaignCrisisContentForTests();
  ensureCampaignCrisisContent();
});

function ctxAt(stage: EffectContext["stage"], stageStartTurn: number, turn: number): EffectContext {
  const def = getCrisisDefinition(campaignDefinitionId("yugoslav_dissolution"))!;
  const instance = { ...createCrisisInstance(def, 0), stage, stageStartTurn };
  return { instance, severity: 60, stage, turn, countryIds: ["YU"], regionIds: [] };
}

describe("living-conflict campaign definitions", () => {
  it("registers a valid tracked definition for every campaign", () => {
    for (const def of allLivingConflictDefs()) {
      const v2 = getCrisisDefinition(campaignDefinitionId(def.key));
      expect(v2, def.key).toBeDefined();
      expect(validateCrisisDefinition(v2!), def.key).toEqual([]);
      expect(v2!.pacing).toEqual({ kind: "tracked", input: campaignIntensityInput(def.key) });
      expect(getCrisisInputProvider(campaignIntensityInput(def.key))).toBeDefined();
    }
  });

  it("only links spillover to definitions that exist, from campaigns that exist", () => {
    ensureLegacyCrisisContent();
    for (const [key, links] of Object.entries(CAMPAIGN_SPILLOVER)) {
      expect(LIVING_CONFLICT_DEFS[key], key).toBeDefined();
      for (const link of links) {
        expect(getCrisisDefinition(link.targetDefinitionId), `${key} -> ${link.id}`).toBeDefined();
      }
    }
    expect(
      convertLivingConflictDef(LIVING_CONFLICT_DEFS.russia_ukraine_security).spillover.length
    ).toBeGreaterThan(0);
  });

  it("links every wave family to at least one crisis template, with unique link ids", () => {
    ensureLegacyCrisisContent();
    for (const key of waveFamilyKeys()) {
      const links = CAMPAIGN_SPILLOVER[key];
      expect(links?.length, key).toBeGreaterThan(0);
      expect(new Set(links.map((l) => l.id)).size, key).toBe(links.length);
      for (const l of links) {
        expect(l.transmission, `${key}/${l.id}`).toBeGreaterThan(0);
        expect(l.transmission, `${key}/${l.id}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("lists the authored rule modules of the campaigns that carry them", () => {
    const moduleIds = (key: string) =>
      campaignRuleRefs(LIVING_CONFLICT_DEFS[key]).map((ref) => ref.moduleId);
    expect(moduleIds("yugoslav_dissolution")).toEqual(
      expect.arrayContaining([
        "lc.civilianLoss",
        "lc.capacityDestruction",
        "lc.refugeeReception",
        "lc.sanctions",
      ])
    );
    expect(moduleIds("russia_ukraine_security")).toContain("lc.sanctions");
  });

  it("stages a tracked campaign from its intensity", () => {
    const def = getCrisisDefinition(campaignDefinitionId("pandemic"))!;
    let instance = createCrisisInstance(def, 0);
    const step = (severity: number, turn: number) => {
      const t = nextStage(instance, def, severity, turn);
      instance = {
        ...instance,
        stage: t.stage,
        stageStartTurn: t.changed ? turn : instance.stageStartTurn,
      };
      return instance.stage;
    };
    expect(step(30, 1)).toBe("onset");
    expect(step(55, 2)).toBe("peak");
    expect(step(30, 3)).toBe("aftermath");
  });
});

describe("campaign rule modules match the original rules", () => {
  const registry = () => createEffectRegistry([...getCrisisEffectRegistry().values()]);
  const run = (key: string, ctx: EffectContext) =>
    evaluateEffectModules(campaignRuleRefs(LIVING_CONFLICT_DEFS[key]), registry(), ctx).intents;

  it("civilian loss removes the same share of residents", () => {
    const [intent] = run("yugoslav_dissolution", ctxAt("peak", 10, 10)).filter(
      (i) => i.kind === "populationLoss"
    );
    const population = 23_400_000;
    expect(intent).toMatchObject({ kind: "populationLoss", countryId: "YU" });
    const fraction = intent.kind === "populationLoss" ? intent.fraction : 0;
    expect(fraction * population).toBeCloseTo(
      requestedConflictCivilianLoss(YUGOSLAV_ESCALATION_CIVILIAN_LOSS, population),
      6
    );
  });

  it("capacity destruction destroys the same share of each region's stock", () => {
    const intents = run("yugoslav_dissolution", ctxAt("peak", 10, 10)).filter(
      (i) => i.kind === "capitalStock"
    );
    const plan = planCapacityDestruction({
      spec: YUGOSLAV_ESCALATION_CAPACITY_DESTRUCTION,
      conflictKey: "yugoslav_dissolution",
      resolutionId: "r1",
      regions: [
        { regionId: "YU_CRO", countryId: "YU", capitalStock: 40_000, outstandingCapital: 0 },
        { regionId: "YU_BIH", countryId: "YU", capitalStock: 25_000, outstandingCapital: 0 },
      ],
    });
    const stock: Record<string, number> = { YU_CRO: 40_000, YU_BIH: 25_000 };
    expect(intents).toHaveLength(plan.obligations.length);
    for (const obligation of plan.obligations) {
      const intent = intents.find(
        (i) => i.kind === "capitalStock" && i.regionId === obligation.regionId
      );
      const fraction = intent?.kind === "capitalStock" ? intent.fraction : 0;
      expect(fraction * stock[obligation.regionId]).toBeCloseTo(obligation.destroyedCapital, 3);
    }
  });

  it("refugee reception requests the authored host share from the origin", () => {
    const [intent] = run("yugoslav_dissolution", ctxAt("peak", 10, 10)).filter(
      (i) => i.kind === "migration"
    );
    expect(intent).toEqual({
      kind: "migration",
      fraction: YUGOSLAV_REFUGEE_RECEPTION.hostPopulationShare,
      fromCountryId: YUGOSLAV_REFUGEE_RECEPTION.originCountryId,
    });
  });

  it("sanctions carry the authored restriction that planCrisisSanctions enforces", () => {
    const intents = run("russia_ukraine_security", ctxAt("peak", 10, 10)).filter(
      (i) => i.kind === "tradeRestriction"
    );
    expect(intents).toEqual([
      { kind: "tradeRestriction", commodity: "oil", targetRole: "backer_a", durationTurns: 24 },
    ]);
    const plans = planCrisisSanctions(
      {
        participationAxis: "sanctions",
        targetRole: "backer_a",
        commodity: "oil",
        durationTurns: 24,
      },
      { US: "bystander", RU: "backer_a" },
      [{ countryId: "US", actorId: "a", responseScores: { sanctions: 3 } }],
      new Set(["US", "RU"]),
      100
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ targetCountry: "RU", commodity: "oil", expiresTurn: 124 });
  });

  it("applies rule effects once, on entry to the stage, and not before", () => {
    expect(run("yugoslav_dissolution", ctxAt("onset", 5, 5))).toEqual([]);
    expect(run("yugoslav_dissolution", ctxAt("peak", 5, 6))).toEqual([]);
    expect(run("yugoslav_dissolution", ctxAt("peak", 6, 6)).length).toBeGreaterThan(0);
  });

  it("world pressure is available as an input equal to the original rule", async () => {
    const db = createMockDb();
    db.collection("coldWarTension").findOne.mockResolvedValue({ _id: "current", value: 92 });
    const wars = [
      {
        status: "active",
        intensity: 70,
        hostCountry: "DE",
        hostEntities: [],
        sideA: { countries: ["US"] },
        sideB: { countries: ["RU"] },
      },
    ];
    db.collection("conflicts").find.mockReturnValue({ toArray: async () => wars });
    const provider = getCrisisInputProvider("worldPressure.vietnam")!;
    const loaded = await provider.load({
      db: db as unknown as Db,
      turn: 1,
      countryIds: new Set(["US"]),
      stateIdsByCountry: new Map(),
    });
    expect(loaded.get("US")).toBe(vietnamWorldPressure(92, wars as never));
    expect(loaded.get("US")).toBe(4);
  });
});

describe("campaign mirror crises", () => {
  const def = LIVING_CONFLICT_DEFS.russia_ukraine_security;
  const participants = {
    belligerents: ["US"],
    neighbors: [],
    blocMembers: [],
    bystanders: [],
  };
  const state = (status: string, hasOpened = true) =>
    ({ defKey: def.key, hasOpened, status, phaseLevel: 1, intensity: 40 }) as never;

  function dbWith(existing: unknown[]) {
    const db = createMockDb();
    db.collection("crises").find.mockReturnValue({ toArray: async () => existing });
    return db;
  }

  it("opens one v2 crisis when the campaign opens", async () => {
    const db = dbWith([]);
    const out = await syncCampaignCrises(db as unknown as Db, 50, [
      { def, state: state("active"), participants },
    ]);
    expect(out.opened).toBe(1);
    const [docs] = db.collectionMocks.crises.insertMany.mock.calls[0] as unknown as [
      { v2: { definitionId: string; scope: string }; scope: string; effects: unknown[] }[],
    ];
    expect(docs[0].v2.definitionId).toBe(campaignDefinitionId(def.key));
    expect(docs[0].scope).toBe("global");
    expect(docs[0].effects).toEqual([]);
    expect(isCampaignCrisis(docs[0] as never)).toBe(true);
  });

  it("does not open before the campaign has opened, and never opens twice", async () => {
    const before = dbWith([]);
    expect(
      (
        await syncCampaignCrises(before as unknown as Db, 50, [
          { def, state: state("active", false), participants },
        ])
      ).opened
    ).toBe(0);
    const again = dbWith([
      { _id: "x", status: "active", v2: { definitionId: campaignDefinitionId(def.key) } },
    ]);
    expect(
      (
        await syncCampaignCrises(again as unknown as Db, 51, [
          { def, state: state("active"), participants },
        ])
      ).opened
    ).toBe(0);
  });

  it("closes the crisis when the campaign settles", async () => {
    const db = dbWith([
      { _id: "x", status: "active", v2: { definitionId: campaignDefinitionId(def.key) } },
    ]);
    const out = await syncCampaignCrises(db as unknown as Db, 90, [
      { def, state: state("settled"), participants },
    ]);
    expect(out.closed).toBe(1);
    expect(db.collectionMocks.crises.updateMany).toHaveBeenCalledOnce();
  });
});

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
