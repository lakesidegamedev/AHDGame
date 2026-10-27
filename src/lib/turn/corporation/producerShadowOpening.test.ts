/**
 * The shadow hands plant preparation a projection of the live sector instead of
 * a copy of the whole document. A projection that misses a field preparation
 * reads would silently change the shadow's market, so this pins the view
 * against a full copy on a sector that exercises the optional paths:
 * retooling, a state-owned sector, an active union settlement, quotes, a
 * carried receipt and a mothballed line.
 */
import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import { makeCorporation } from "@/lib/test-utils/factories";
import type { ShadowPlantCarry } from "@/lib/market/producerMarket/shadowCarryRules";
import {
  prepareProducerPhysicalSector,
  type ProducerPhysicalEnv,
} from "./producerPhysicalPreparation";
import { isolatedShadowEnv, shadowOpeningSector } from "./producerMarketShadowPhase";

const TURN = 300;

function env(): ProducerPhysicalEnv {
  return {
    currentTurn: TURN,
    currentYear: 1991,
    techTreesEnabled: false,
    labour: { wagesEnabled: true, unionsEnabled: true, fullEnabled: false },
    wageIndexByState: new Map([["CA", { weighted: 40, workers: 40 }]]),
    automationIndexByState: new Map([["CA", { weighted: 20, workers: 40 }]]),
    pendingStrikeEvents: [],
    labourDemandByState: new Map([["CA", 40]]),
    labourDemandWageIndexByState: new Map([["CA", { weighted: 40, workers: 40 }]]),
    lookups: {
      preset: "1991-default",
      eraUnitScale: 1,
      labourTightnessByState: new Map([["CA", 0.5]]),
      stateResourceCapacityByState: new Map(),
      priceRatioByCommodity: new Map(),
      activeDisasterEffectsByState: new Map(),
      rawWorkforceSkillByState: new Map([["CA", 0.6]]),
      extractionCapacityUtilBySector: new Map(),
    },
  } as unknown as ProducerPhysicalEnv;
}

/** A live sector with every optional field preparation can read. */
function sector(): CorporateSector {
  return {
    _id: new ObjectId(),
    corporationId: new ObjectId(),
    countryId: "US",
    stateId: "CA",
    sectorType: "financial",
    strategyId: "standard",
    transitionFromStrategyId: "standard",
    transitionStartTurn: TURN - 6,
    retoolRescaleApplied: true,
    revenue: 999_999,
    profitMargin: 24,
    workers: 40,
    targetGrowthRate: 0,
    currentGrowthRate: 0,
    currentGrowthCost: 0,
    capitalStock: 240,
    capacityBookAnchor: 100,
    buildQueue: [],
    mothballed: false,
    activeCapacityPercent: 80,
    productionPolicyLevel: 1,
    productionPolicy: 0,
    labourStaffingFactor: 0.9,
    wageLevel: 1.2,
    unionization: 65,
    workerExpectationIndex: 1.05,
    representingUnionId: new ObjectId(),
    strikeStartedAtTurn: TURN - 3,
    strikeCooldownUntilTurn: 0,
    soeMandate: { priceControlled: true, employmentGuaranteed: true },
    nationalizedAtTurn: TURN - 100,
    nationalizationTransitionMultiplier: 0.94,
    producerQuotes: { financial_services: { kind: "manual", unitPrice: 3 } },
    inventoryUnits: { financial_services: 12, steel: 4 },
    cutoverTransition: { mismatched: true } as never,
    cutoverStruggling: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as unknown as CorporateSector;
}

function carried(): ShadowPlantCarry {
  return {
    inputStock: [{ commodity: "advertising", units: 2, value: 2 }],
    outputStock: [{ commodity: "financial_services", book: "world", units: 7 }],
    receipt: {
      activeUnits: 12,
      producedUnits: 11,
      offeredUnits: 10,
      soldUnits: 9,
      revenue: 120,
      inputsConsumed: 50,
    },
  };
}

function prepare(input: {
  corporation: ReturnType<typeof makeCorporation>;
  sector: CorporateSector;
  env: ProducerPhysicalEnv;
}) {
  return prepareProducerPhysicalSector({
    worldEpoch: "world",
    env: isolatedShadowEnv(input.env),
    corporation: input.corporation,
    sector: input.sector,
    inputPriceHeadroom: 1.25,
  });
}

/** The same opening fields on a full copy, which is what the view replaces. */
function fullCopy(sector: CorporateSector, view: CorporateSector): CorporateSector {
  return {
    ...sector,
    capacityBookAnchor: view.capacityBookAnchor ?? 0,
    buildQueue: view.buildQueue ?? [],
    producerCapacity: view.producerCapacity,
    producerInventory: view.producerInventory,
    producerSettlement: view.producerSettlement,
  } as CorporateSector;
}

describe("shadow opening view", () => {
  it("prepares the same plant as a full copy for every optional path", () => {
    for (const stateOwned of [false, true]) {
      for (const carry of [undefined, carried()]) {
        const corporation = makeCorporation({
          countryId: "US",
          liquidCurrencyCode: "USD",
          ...(stateOwned ? { countryOwnerId: "US" } : {}),
        });
        const live = sector();
        live.corporationId = corporation._id;
        const view = shadowOpeningSector(live, "world", TURN, carry);
        const preparedView = prepare({ corporation, sector: view, env: env() });
        const preparedCopy = prepare({
          corporation,
          sector: fullCopy(live, view),
          env: env(),
        });
        expect(preparedView).toEqual(preparedCopy);
      }
    }
  });

  it("never writes the opening onto the live sector", () => {
    const corporation = makeCorporation({ countryId: "US", liquidCurrencyCode: "USD" });
    const live = sector();
    live.corporationId = corporation._id;
    const view = shadowOpeningSector(live, "world", TURN, carried());
    prepare({ corporation, sector: view, env: env() });
    expect((live as { producerCapacity?: unknown }).producerCapacity).toBeUndefined();
    expect((live as { producerInventory?: unknown }).producerInventory).toBeUndefined();
    expect((live as { producerSettlement?: unknown }).producerSettlement).toBeUndefined();
    expect(live.inventoryUnits).toEqual({ financial_services: 12, steel: 4 });
  });

  it("keeps a sector that already has books untouched", () => {
    const corporation = makeCorporation({ countryId: "US", liquidCurrencyCode: "USD" });
    const live = sector();
    live.corporationId = corporation._id;
    live.producerCapacity = { worldEpoch: "world", turn: TURN - 1 };
    live.producerInventory = {
      worldEpoch: "world",
      turn: TURN - 1,
      inputStock: [],
      outputStock: [],
    };
    expect(shadowOpeningSector(live, "world", TURN)).toBe(live);
  });
});
