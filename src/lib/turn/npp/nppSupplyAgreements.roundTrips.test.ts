/**
 * Round-trip budget for the NPP supply-agreement pass.
 *
 * The pass runs once per turn against every NPP corporation and every live
 * agreement, on a remote Mongo in multiplayer. What it costs is therefore the
 * number of round trips, not timing: this fixture holds a large NPP cohort so
 * a reintroduced per-row query fails here instead of in production.
 */
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import { processNppSupplyAgreements } from "./nppSupplyAgreements";

const TURN = 48;
const COUNTRIES = ["US", "US", "US", "UK", "FR", "DE", "JP", "BR"] as const;
const NPPS = 240;
const AGREEMENTS_PER_NPP = 3;

function fixture() {
  const db = createInMemoryDb();
  db.seed("gameConfig", [
    { _id: "default", supplyAgreementsEnabled: true, commandEconomyEnabled: false },
  ]);
  db.seed("gameState", [{ _id: "current", currentYear: 1990, currentTurn: TURN }]);
  db.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  db.seed("tradeEmbargoes", []);

  const corps: Record<string, unknown>[] = [];
  const sectors: Record<string, unknown>[] = [];
  const agreements: Record<string, unknown>[] = [];
  const listings: Record<string, unknown>[] = [];
  const corpIds: ObjectId[] = [];
  for (let n = 0; n < NPPS; n += 1) {
    const id = new ObjectId(`${String(n).padStart(8, "0")}0000000000000000`);
    corpIds.push(id);
    const countryId = COUNTRIES[n % COUNTRIES.length];
    corps.push({ _id: id, countryId, ceoType: "npp" });
    // A seller with spare capacity and a buyer short of inputs, both in the same
    // country: the pair the matcher is built to connect.
    sectors.push({
      _id: new ObjectId(`${String(n).padStart(8, "0")}0000000000000001`),
      corporationId: id,
      sectorType: "extraction",
      capitalStock: 20_000,
      strategyId: "iron_mining",
      soldFraction: 0.2,
      productionPolicyLevel: 0,
      countryId,
      stateId: `${countryId}-1`,
    });
    sectors.push({
      _id: new ObjectId(`${String(n).padStart(8, "0")}0000000000000002`),
      corporationId: id,
      sectorType: "manufacturing",
      capitalStock: 20_000,
      strategyId: "steel",
      throughputFactor: 0.7,
      productionPolicyLevel: 0,
      countryId,
      stateId: `${countryId}-1`,
    });
  }
  const commodities = ["iron", "steel", "coal"] as const;
  for (let n = 0; n < NPPS; n += 1) {
    for (let k = 0; k < AGREEMENTS_PER_NPP; k += 1) {
      const supplier = corpIds[n];
      const buyer = corpIds[(n + 1 + k) % NPPS];
      const commodity = commodities[k % commodities.length];
      agreements.push({
        _id: new ObjectId(`${String(n).padStart(8, "0")}00000000000001${k}0`),
        supplierCorpId: supplier,
        buyerCorpId: buyer,
        commodity,
        volumeCap: 40,
        pricePremium: 0,
        status: k === 0 ? "active" : "pending",
        proposedByCorpId: buyer,
        // One in ten is within its final turns, so the expiry path runs.
        ...(n % 10 === 0 && k === 0 ? { expiresAtTurn: TURN } : {}),
        durationTurns: 48,
        startsAtTurn: TURN - 10,
      });
    }
    // A listing the rules no longer want, so the stale half of the refresh runs.
    listings.push({
      _id: `${corpIds[n].toString()}:ai:sell:unobtainium`,
      corporationId: corpIds[n],
      aiListed: true,
      slot: 1,
      side: "buy",
      commodity: "coal",
      volumeCap: 5,
      pricePremium: 0,
      durationTurns: 48,
      expiresAtTurn: TURN - 1,
    });
    listings.push({
      _id: `${corpIds[n].toString()}:ai:sell:iron`,
      corporationId: corpIds[n],
      aiListed: true,
      slot: 0,
      side: "sell",
      commodity: "iron",
      volumeCap: 500,
      pricePremium: 0,
      durationTurns: 48,
      expiresAtTurn: TURN + 4,
    });
  }
  // A player buyer's inbound proposal at an AI supplier, which the matcher
  // accepts from a batched read of the counterparties.
  const playerId = new ObjectId("000000000000000000000001");
  corps.push({ _id: playerId, countryId: "UK", ceoType: "player" });
  agreements.push({
    _id: new ObjectId("0000000000000000000000aa"),
    supplierCorpId: corpIds[0],
    buyerCorpId: playerId,
    commodity: "iron",
    volumeCap: 10,
    pricePremium: 0,
    status: "pending",
    proposedByCorpId: playerId,
    durationTurns: 48,
  });
  db.seed("corporations", corps);
  db.seed("corporateSectors", sectors);
  db.seed("supplyAgreements", agreements);
  db.seed("supplyListings", listings);
  db.seed(
    "commodityPrices",
    commodities.flatMap((commodity) => [
      { commodity, turn: TURN, basePrice: 10, globalPrice: 12 },
      { commodity, turn: TURN - 1, basePrice: 10, globalPrice: 11 },
    ])
  );
  return db;
}

describe("processNppSupplyAgreements round trips", () => {
  it("stays inside a fixed budget for a large NPP cohort", async () => {
    const db = fixture();
    const counter = countRoundTrips(db);
    const startedAt = performance.now();
    await processNppSupplyAgreements(db as unknown as Db, TURN, new Date(), true);
    const ms = performance.now() - startedAt;
    // The pass reads its cohorts once and writes them in bulk: the count must
    // not move with the number of corporations or agreements.
    expect(
      counter.total() <= 10,
      `nppSupplyAgreements: ${counter.total()} round trips, ${ms.toFixed(1)} ms, ${counter.summary()}`
    ).toBe(true);

    // Same end state as the two-write refresh: the stale listing is gone, the
    // wanted one is refreshed, and the player's proposal was accepted.
    const listings = db.collection("supplyListings").docs;
    // The stale half of the refresh travels in the same write as the upserts;
    // the unit tests pin the delete op itself, which this harness cannot
    // exercise because it does not evaluate the corporation id filter.
    expect(listings.some((row) => String(row._id).endsWith(":ai:sell:unobtainium"))).toBe(false);
    expect(listings.find((row) => String(row._id).endsWith(":ai:sell:iron"))).toMatchObject({
      expiresAtTurn: TURN + 24,
      durationTurns: 48,
    });
    expect(
      db
        .collection("supplyAgreements")
        .docs.find((row) => row.buyerCorpId instanceof ObjectId && row.volumeCap === 10)
    ).toMatchObject({ status: "active" });
  });
});
