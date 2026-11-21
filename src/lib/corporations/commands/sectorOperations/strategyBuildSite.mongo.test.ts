import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { CorporateSector, SectorBuildOrder } from "@/lib/db/types";
import { getMongoClient } from "@/lib/mongodb";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { ensureNationalizationSiteIndex } from "@/lib/migrations/entries/2026-11-16-nationalization-site-identity";
import {
  REAL_MONGO_ENABLED,
  sleep,
  startIsolatedMongod,
  stopIsolatedMongod,
  type IsolatedMongod,
} from "@/lib/test-utils/realMongoFixture";
import { placeStrategyBuildSite, strategyBuildSiteIdentity } from "./strategyBuildSite";

vi.mock("@/lib/mongodb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mongodb")>()),
  getMongoClient: vi.fn(),
}));

describe.skipIf(!REAL_MONGO_ENABLED)("strategy builds on an isolated replica set", () => {
  let handle: IsolatedMongod;

  beforeAll(async () => {
    handle = await startIsolatedMongod("ahd-strategy-build-", { replicaSet: "strategy-build" });
    await handle.client.db("admin").command({
      replSetInitiate: {
        _id: "strategy-build",
        members: [{ _id: 0, host: new URL(handle.uri).host }],
      },
    });
    const deadline = Date.now() + 20_000;
    while (!(await handle.client.db("admin").command({ hello: 1 })).isWritablePrimary) {
      if (Date.now() > deadline) throw new Error("Test replica set did not elect a primary");
      await sleep(100);
    }
    vi.mocked(getMongoClient).mockResolvedValue(handle.client);
    await ensureNationalizationSiteIndex(handle.db);
  }, 40_000);

  afterAll(async () => {
    await stopIsolatedMongod(handle);
  }, 25_000);

  it("charges once for a retried build and keeps the original site and queue", async () => {
    const corporationId = new ObjectId();
    const sectors = corporateSectorsCollection(handle.db);
    const corporations = corporationsCollection(handle.db);
    const now = new Date();
    const order: SectorBuildOrder = {
      unitsOrdered: 80,
      strategyId: "hardware",
      costPaidAnchor: 1000,
      startTurn: 64,
      onlineTurn: 80,
    };
    const original: CorporateSector = {
      _id: new ObjectId(),
      corporationId,
      countryId: "US",
      stateId: "CA",
      sectorType: "technology",
      strategyId: "standard",
      targetGrowthRate: 0,
      currentGrowthRate: 0,
      currentGrowthCost: 0,
      revenue: 100,
      profitMargin: 10,
      workers: 100,
      capitalStock: 800,
      buildQueue: [{ ...order, strategyId: "standard" }],
      createdAt: now,
      updatedAt: now,
    };
    await sectors.insertOne(original);
    await corporations.insertOne({ _id: corporationId, liquidCapital: 1500 } as never);
    const site: CorporateSector = {
      ...original,
      ...strategyBuildSiteIdentity(corporationId, "site-1"),
      strategyId: "hardware",
      workers: 0,
      capitalStock: 0,
      buildQueue: [],
    };
    const attempts = await Promise.all([
      placeStrategyBuildSite(handle.db, site, order, 1000),
      placeStrategyBuildSite(handle.db, site, order, 1000),
    ]);

    expect(attempts.sort()).toEqual(["created", "existing"]);
    expect(await sectors.findOne({ _id: original._id })).toEqual(original);
    expect(await sectors.findOne({ _id: site._id })).toMatchObject({
      stateId: original.stateId,
      strategyId: "hardware",
      buildQueue: [order],
    });
    expect(await corporations.findOne({ _id: corporationId })).toMatchObject({
      liquidCapital: 500,
    });

    const anotherSite = { ...site, ...strategyBuildSiteIdentity(corporationId, "site-2") };
    await expect(placeStrategyBuildSite(handle.db, anotherSite, order, 1000)).resolves.toBe(
      "insufficient_cash"
    );
    expect(await sectors.findOne({ _id: anotherSite._id })).toBeNull();
  }, 20_000);
});
