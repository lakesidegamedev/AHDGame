/**
 * Synthetic NPP-decision world: the fixture the corporation brain's CPU cost is
 * measured and pinned against.
 *
 * The live world is roughly 2,000 corporations, a few hundred of them NPP-run,
 * and a couple of thousand corporate sectors. Building that here (rather than
 * bootstrapping a preset) keeps the benchmark to seconds and makes the document
 * shapes explicit, so a decision input that starts to matter shows up as a
 * missing field in this file instead of as a branch that silently never runs.
 *
 * Deterministic: ids, cash and margins come from one seeded rng, so the same
 * options always produce the same world and the same decisions.
 */
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { CORPORATION_TYPES } from "@/lib/constants/corporations";
import type { CorporationType } from "@/lib/constants/corporations";
import { COMMODITY_TYPES } from "@/lib/constants/commodities";
import { makeSeededRng } from "@/lib/events/substrate/rng";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";

export interface NppDecisionsWorldOptions {
  /** Total corporations in the world, NPP-run and player-owned together. */
  corporations?: number;
  /** How many of them an NPP CEO runs. */
  nppCorporations?: number;
  seed?: string;
  turn?: number;
  /** Market system mode written to gameConfig; plants exercises the full brain. */
  marketSystemMode?: string;
  techTreesEnabled?: boolean;
}

export interface NppDecisionsWorld {
  db: Db;
  memory: InMemoryDb;
  /** NPP-run corporation ids, in the order the phase sees them. */
  nppCorporationIds: string[];
  turn: number;
  now: Date;
}

const STATES_BY_COUNTRY: Record<string, string[]> = {
  US: ["NY", "CA", "TX", "IL", "FL", "OH"],
  UK: ["LON", "MAN", "BIR", "LEE", "GLA", "CAR"],
  FR: ["IDF", "ARA", "OCC", "NOR", "PAC", "GES"],
  DE: ["BE", "BY", "BW", "NW", "HE", "SN"],
  JP: ["TYO", "OSA", "AIC", "HOK", "FUK", "KYO"],
  BR: ["SP", "RJ", "MG", "BA", "RS", "PR"],
  CN: ["BJ", "SH", "GD", "SC", "HB", "ZJ"],
  IT: ["LAZ", "LOM", "CAM", "PIE", "TOS", "SIC"],
  ES: ["MAD", "CAT", "AND", "VAL", "GAL", "PVA"],
  SE: ["STO", "VGO", "SKN", "UPP", "OST", "DAL"],
  TR: ["IST", "ANK", "IZM", "BUR", "ANT", "KON"],
  IE: ["DUB", "COR", "GAL", "LIM", "WAT", "KIL"],
};

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  US: "USD",
  UK: "GBP",
  FR: "EUR",
  DE: "EUR",
  JP: "JPY",
  BR: "BRL",
  CN: "CNY",
  IT: "EUR",
  ES: "EUR",
  SE: "SEK",
  TR: "TRY",
  IE: "EUR",
};

const FX_BY_CURRENCY: Record<string, number> = {
  USD: 1,
  GBP: 0.79,
  EUR: 0.92,
  JPY: 101.4,
  BRL: 5.3,
  CNY: 7.1,
  SEK: 10.4,
  TRY: 8.6,
  NGN: 1900,
  INR: 83,
};

const NPP_ARCHETYPES = [
  "cautious",
  "aggressive",
  "opportunist",
  "steward",
  "visionary",
  "traditionalist",
] as const;

/** Live worlds are expand-heavy: the loop defaults to expand on first sight. */
function strategyIdFor(rng: () => number): (typeof STRATEGY_IDS)[number] {
  const roll = rng();
  if (roll < 0.62) return "expand";
  if (roll < 0.82) return "defend";
  if (roll < 0.92) return "consolidate";
  if (roll < 0.97) return "retool";
  return "harvest";
}

/** Deterministic ObjectId for index `n` so two runs are byte-identical. */
function idFor(prefix: number, n: number): ObjectId {
  return new ObjectId(`${prefix}`.padStart(2, "0") + n.toString(16).padStart(22, "0"));
}

function countries(): string[] {
  return Object.keys(STATES_BY_COUNTRY);
}

/** Shortage ratio with the same soft-knee shape the live price book uses. */
function stateRatio(supply: number, demand: number): number {
  const raw = Math.max(demand, 1) / Math.max(supply, 1);
  const knee = 3;
  return raw <= knee ? raw : knee + Math.log(raw / knee + 1) * 0.5;
}

function commodityPriceDocs(rng: () => number): Record<string, unknown>[] {
  const docs: Record<string, unknown>[] = [];
  for (const commodity of COMMODITY_TYPES) {
    const nationalSupply: Record<string, number> = {};
    const nationalDemand: Record<string, number> = {};
    const stateSupply: Record<string, number> = {};
    const stateDemand: Record<string, number> = {};
    for (const country of countries()) {
      const supply = 40_000 + rng() * 220_000;
      const demand = supply * (0.65 + rng() * 0.9);
      nationalSupply[country] = supply;
      nationalDemand[country] = demand;
      for (const state of STATES_BY_COUNTRY[country] ?? []) {
        const share = 0.08 + rng() * 0.1;
        stateSupply[state] = supply * share;
        stateDemand[state] = demand * share * (0.7 + rng() * 0.7);
      }
    }
    const globalSupply = Object.values(nationalSupply).reduce((a, b) => a + b, 0);
    const globalDemand = Object.values(nationalDemand).reduce((a, b) => a + b, 0);
    const basePrice = 40 + COMMODITY_TYPES.indexOf(commodity) * 6;
    const nationalPrices: Record<string, number> = {};
    const reachablePrices: Record<string, number> = {};
    const statePrices: Record<string, number> = {};
    for (const country of countries()) {
      const ratio = stateRatio(nationalSupply[country] ?? 1, nationalDemand[country] ?? 1);
      nationalPrices[country] = basePrice * ratio;
      reachablePrices[country] = nationalPrices[country];
      for (const state of STATES_BY_COUNTRY[country] ?? []) {
        statePrices[state] =
          basePrice * stateRatio(stateSupply[state] ?? 1, stateDemand[state] ?? 1);
      }
    }
    docs.push({
      _id: commodity,
      commodity,
      basePrice,
      globalPrice: basePrice * stateRatio(globalSupply, globalDemand),
      nationalPrices,
      reachablePrices,
      statePrices,
      nationalSupply,
      nationalDemand,
      stateSupply,
      stateDemand,
      globalSupply,
      globalDemand,
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });
  }
  return docs;
}

function unownedSectorDocs(rng: () => number): Record<string, unknown>[] {
  const docs: Record<string, unknown>[] = [];
  let n = 0;
  for (const country of countries()) {
    for (const state of STATES_BY_COUNTRY[country] ?? []) {
      for (const sectorType of CORPORATION_TYPES) {
        const pools = 3 + Math.floor(rng() * 5);
        for (let pool = 0; pool < pools; pool += 1) {
          const revenue = 200_000 + rng() * 3_000_000;
          docs.push({
            _id: idFor(90, n++),
            stateId: state,
            countryId: country,
            sectorType,
            revenue,
            headroomUnits: 200 + Math.floor(rng() * 4_000),
            createdAt: new Date("2026-10-01T00:00:00Z"),
            updatedAt: new Date("2026-10-01T00:00:00Z"),
          });
        }
      }
    }
  }
  return docs;
}

function corporationDoc(
  rng: () => number,
  index: number,
  npp: boolean,
  turn: number
): Record<string, unknown> {
  const country = countries()[index % countries().length];
  const states = STATES_BY_COUNTRY[country];
  const type = CORPORATION_TYPES[Math.floor(rng() * CORPORATION_TYPES.length)];
  const strategy = npp && rng() < 0.7 ? strategyIdFor(rng) : null;
  return {
    _id: idFor(70, index),
    sequentialId: 900_000 + index,
    name: `Corp ${index}`,
    tickerSymbol: `C${index.toString(36).toUpperCase().slice(0, 4).padStart(4, "X")}`,
    type,
    countryId: country,
    ceoType: npp ? "npp" : "player",
    ceoId: npp ? idFor(80, index).toString() : null,
    userId: npp ? null : idFor(81, index).toString(),
    headquartersState: states[index % states.length],
    liquidCapital: 4_000_000 + rng() * 180_000_000,
    liquidCurrencyCode: CURRENCY_BY_COUNTRY[country],
    marketingBudget: rng() * 900_000,
    marketingStrength: rng() * 100,
    logisticsBudget: rng() * 700_000,
    logisticsStrength: rng() * 100,
    rdBudget: rng() * 600_000,
    rdScore: rng() * 100,
    ceoSalary: rng() * 120_000,
    totalShares: 1_000_000 + Math.floor(rng() * 20_000_000),
    sharePrice: 1 + rng() * 60,
    publicFloat: rng() * 0.7,
    dividendRate: rng() < 0.4 ? 0.01 + rng() * 0.04 : 0,
    isPrivate: !npp && rng() < 0.2,
    isNationalized: false,
    hiddenFromExchange: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...(strategy
      ? { nppStrategy: { id: strategy, adoptedTurn: turn - 12, baselineScore: rng() * 12 } }
      : {}),
    ...(npp && rng() < 0.15
      ? { autopilot: { enabledTurn: turn - 40, advisories: [], notifiedTurn: {} } }
      : {}),
  };
}

function sectorDocs(
  rng: () => number,
  corpIndex: number,
  corp: Record<string, unknown>,
  firstSectorId: number
): { docs: Record<string, unknown>[]; nextId: number } {
  const count = corp.ceoType === "npp" ? 4 + Math.floor(rng() * 20) : 1 + Math.floor(rng() * 4);
  const docs: Record<string, unknown>[] = [];
  let sectorId = firstSectorId;
  const country = String(corp.countryId);
  const states = STATES_BY_COUNTRY[country] ?? ["NY"];
  const plantsEnabled = true;
  for (let i = 0; i < count; i += 1) {
    const sectorType =
      i === 0
        ? (corp.type as CorporationType)
        : CORPORATION_TYPES[Math.floor(rng() * CORPORATION_TYPES.length)];
    const revenue = 80_000 + rng() * 6_000_000;
    const nppSector = corp.ceoType === "npp";
    const margin = nppSector ? 18 + rng() * 27 : -12 + rng() * 55;
    const capitalStock = 200 + rng() * 9_000;
    const producedUnits = capitalStock * (nppSector ? 0.75 + rng() * 0.3 : 0.4 + rng() * 0.8);
    const soldUnits = producedUnits * (nppSector ? 0.86 + rng() * 0.17 : 0.45 + rng() * 0.62);
    const strategyId = rng() < 0.15 ? "retool" : "standard";
    docs.push({
      _id: idFor(60, sectorId++),
      corporationId: idFor(70, corpIndex),
      sectorType,
      countryId: country,
      stateId: states[Math.floor(rng() * states.length)],
      revenue,
      realizedRevenue:
        revenue * (corp.ceoType === "npp" ? 0.8 + rng() * 0.25 : 0.55 + rng() * 0.55),
      profitMargin: margin,
      effectiveProfitMargin: margin,
      targetGrowthRate: rng() < 0.3 ? rng() * 4 : 0,
      currentGrowthRate: 0,
      currentGrowthCost: 0,
      workers: 200 + Math.floor(rng() * 4_000),
      capitalStock,
      operatingCapacityUnits: capitalStock,
      producedUnits,
      soldUnits,
      soldFraction: soldUnits / Math.max(producedUnits, 1),
      utilization: producedUnits / Math.max(capitalStock, 1),
      demandThrottleFactor: rng() < 0.85 ? 1 : 0.1 + rng() * 0.5,
      lowFillTurns: rng() < 0.2 ? Math.floor(rng() * 6) : 0,
      producerZeroSalesTurns: rng() < 0.08 ? Math.floor(rng() * 4) : 0,
      strategyId,
      productionPolicy: "balanced",
      ...(plantsEnabled && rng() < 0.7
        ? {
            plantsPnl: {
              revenue,
              profit: revenue * (margin / 100),
              costs: revenue * (1 - margin / 100),
            },
          }
        : {}),
      ...(rng() < 0.2
        ? {
            buildQueue: [
              {
                id: `b${sectorId}`,
                unitsOrdered: 100 + Math.floor(rng() * 900),
                costPaidAnchor: 50_000 + rng() * 400_000,
                startTurn: 448 + Math.floor(rng() * 8),
                onlineTurn: turnOffset(rng),
              },
            ],
          }
        : {}),
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });
  }
  return { docs, nextId: sectorId };
}

function turnOffset(rng: () => number): number {
  return 460 + Math.floor(rng() * 8);
}

function nppDocs(count: number): Record<string, unknown>[] {
  const docs: Record<string, unknown>[] = [];
  for (let n = 0; n < count; n += 1) {
    docs.push({
      _id: idFor(80, n),
      name: `NPP ${n}`,
      personality: {
        archetype: NPP_ARCHETYPES[n % NPP_ARCHETYPES.length],
        risk: 0.2 + (n % 5) * 0.15,
      },
    });
  }
  return docs;
}

export async function seedNppDecisionsWorld(
  options: NppDecisionsWorldOptions = {}
): Promise<NppDecisionsWorld> {
  const memory = createInMemoryDb();
  const db = memory as unknown as Db;
  const corporations = options.corporations ?? 2_000;
  const nppCorporations = Math.min(options.nppCorporations ?? 400, corporations);
  const turn = options.turn ?? 458;
  const now = new Date(`2026-10-${String(20 + (turn % 8)).padStart(2, "0")}T12:00:00Z`);
  const rng = makeSeededRng(options.seed ?? "npp-decisions-world");

  const corpDocs: Record<string, unknown>[] = [];
  const sectorDocsAll: Record<string, unknown>[] = [];
  const nppCorporationIds: string[] = [];
  let sectorCursor = 0;
  for (let index = 0; index < corporations; index += 1) {
    const npp = index < nppCorporations;
    const corp = corporationDoc(rng, index, npp, turn);
    corpDocs.push(corp);
    if (npp) nppCorporationIds.push(String(corp._id));
    const { docs, nextId } = sectorDocs(rng, index, corp, sectorCursor);
    sectorCursor = nextId;
    sectorDocsAll.push(...docs);
  }

  await db.collection("corporations").insertMany(corpDocs as never[]);
  await db.collection("corporateSectors").insertMany(sectorDocsAll as never[]);
  await db.collection("unownedSectors").insertMany(unownedSectorDocs(rng) as never[]);
  await db.collection("commodityPrices").insertMany(commodityPriceDocs(rng) as never[]);
  await db.collection("npps").insertMany(nppDocs(nppCorporations) as never[]);
  await db.collection("exchangeRates").insertMany(
    Object.entries(FX_BY_CURRENCY).map(([currencyCode, rate]) => ({
      _id: currencyCode,
      currencyCode,
      rate,
      updatedAt: now,
    })) as never[]
  );
  await db.collection("gameState").insertOne({
    _id: "current",
    currentTurn: turn,
    currentYear: 2019,
    startingYear: 2019,
    preset: "2019-default",
    worldEpochId: "epoch-fixture",
    nppCorpStrategyEnabled: true,
    subsidiaryCorporationsEnabled: false,
    frontierEntryExperimentEnabled: false,
    nppAutonomyLevel: "v2",
    isProcessing: false,
  } as never);
  await db.collection("gameConfig").insertOne({
    _id: "default",
    marketSystemMode: options.marketSystemMode ?? "plants",
    labourSystemMode: "full",
    ledgerShadow: false,
    techTreesEnabled: options.techTreesEnabled === true,
    nppFragileMarketSupplyEnabled: true,
    nppMarketCoverageEnabled: true,
    commandEconomyEnabled: false,
    privateBankingEnabled: false,
    treasuryCashLedgerEnabled: false,
    constructionFinanceEnabled: false,
    producerConversionPaceShare: 0,
    producerFundedRestartStage: 0,
    updatedAt: now,
  } as never);

  return { db, memory, nppCorporationIds, turn, now };
}
