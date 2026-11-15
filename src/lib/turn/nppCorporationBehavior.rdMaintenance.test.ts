/**
 * Engine 6 R&D maintenance (npp engine 6.18.0). Any positive R&D budget earns
 * the flat per-turn base gain, so a thin-margin or cash-short NPP corp keeps a
 * token R&D budget rather than zero and its quality tech pillar holds.
 */
import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import {
  makeNppCorpDecision,
  type CommodityPriceRatioFn,
  type NppPlantsContext,
} from "./nppCorporationBehavior";
import { ceoArchetypeModifiers } from "@/lib/npp/ceoArchetype";
import type { CeoArchetype } from "@/lib/npp/ceoArchetype";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import { candidate, candidatesByCountry, demandSignals } from "./npp/__fixtures__/marketCandidates";
import type { MarketCandidate } from "./npp/marketCandidates";
import { foundingStarterUnits } from "@/lib/corporations/foundingPlant";
import { CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";

const noPrices: CommodityPriceRatioFn = () => null;
const noState = new Set<string>();
const TURN = 100;

const ROOM_UNITS = foundingStarterUnits("manufacturing") * 40;
const roomSignals = () => demandSignals({ "NY:manufacturing": ROOM_UNITS });

const plantsCtx: NppPlantsContext = {
  enabled: true,
  eraUnitScale: 1,
  year: CAPACITY_ANCHOR_YEAR,
  preset: "2019-default",
  primeRateOf: () => 0,
  costOfLivingOf: () => null,
};

function pool(): MarketCandidate {
  return candidate({ stateId: "NY" });
}

/** Anchor-currency corp, so every figure below reads directly in ₳. */
function corp(liquidCapital: number): Corporation {
  return {
    _id: new ObjectId(),
    countryId: "US",
    type: "manufacturing",
    headquartersState: "NY",
    liquidCurrencyCode: "USD",
    liquidCapital,
    ceoType: "npp",
  } as unknown as Corporation;
}

/** One healthy sector: 30% margin, selling into a real market. */
function sector(): CorporateSector {
  return {
    _id: new ObjectId(),
    sectorType: "technology",
    countryId: "US",
    stateId: "NY",
    revenue: 1_000_000,
    realizedRevenue: 1_000_000,
    profitMargin: 30,
    effectiveProfitMargin: 30,
    targetGrowthRate: 2,
  } as unknown as CorporateSector;
}

function decide(liquidCapital: number, archetype: CeoArchetype, engineSix?: boolean) {
  return makeNppCorpDecision(
    {
      corp: corp(liquidCapital),
      sectors: [sector()],
      turn: TURN,
      now: new Date(),
      fxRate: 1,
      modifiers: ceoArchetypeModifiers(archetype),
      ...(engineSix != null ? { engineSix } : {}),
    },
    candidatesByCountry([pool()]),
    noState,
    noPrices,
    plantsCtx,
    roomSignals()
  );
}

describe("NPP R&D maintenance (engine 6)", () => {
  it("keeps a token R&D budget when cash is below the floor at v6", () => {
    // 1,000,000 revenue x NPP_RD_MAINTENANCE_SHARE (0.001).
    expect(decide(50_000, "aggressive", true).updates.rdBudget).toBe(1_000);
  });

  it("leaves engine 5 behaviour unchanged below v6", () => {
    expect(decide(50_000, "aggressive", false).updates.rdBudget ?? 0).toBe(0);
    expect(decide(50_000, "aggressive").updates.rdBudget ?? 0).toBe(0);
  });

  it("does not lower a budget already above the token floor", () => {
    expect(decide(1_000_000, "cautious", true).updates.rdBudget as number).toBeGreaterThan(1_000);
  });
});
