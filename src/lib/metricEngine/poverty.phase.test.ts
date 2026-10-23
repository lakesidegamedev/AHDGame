import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { RESET_V2_SEED_REVISION } from "@/lib/resetVersions/rules";
import { runMetricEngine } from "./phase";

describe("funded poverty through the production macro phase", () => {
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL"])(
    "publishes a funding-sensitive poverty value for %s",
    async (countryId) => {
      async function run(factor: number, crimeScore = 50, bookedSocial = 0) {
        const db = createMockDb();
        const regionId = `${countryId}-test`;
        function rows(name: string, data: unknown[]) {
          const cursor = {
            toArray: vi.fn().mockResolvedValue(data),
            project: vi.fn().mockReturnThis(),
          };
          db.collection(name).find.mockReturnValue(cursor);
        }
        rows("states", [
          {
            _id: regionId,
            countryId,
            name: "Test",
            population: 100000,
            workingAgePopulation: 60000,
            gdp: 1000,
            capitalStock: 3000,
          },
        ]);
        rows("macroMetrics", [
          {
            _id: regionId,
            countryId,
            economic: {
              povertyRate: { value: 15, simBaseline: 15 },
              unemploymentRate: { value: 5 },
              laborParticipation: { value: 60 },
              laborForce: { value: 36000 },
            },
          },
        ]);
        rows("politicalMetrics", [
          {
            _id: regionId,
            countryId,
            values: { "order.safety": crimeScore, "society.socialMobility": 50 },
          },
        ]);
        const seedCountries = ["US", "UK", "JP", "IE", "SCO", "WAL"];
        db.collection("gameState").findOne.mockResolvedValue({
          _id: "current",
          currentTurn: 9,
          resetWorldId: "world",
          metricsSystemVersion: "v2",
          legislationSystemVersion: "v2",
          resetVersionSeeds: Object.fromEntries(
            ["metrics", "legislation"].map((system) => [
              system,
              {
                worldId: "world",
                revision: RESET_V2_SEED_REVISION[system as "metrics" | "legislation"],
                sourceTurn: 1,
                completedAt: "fixture",
                verificationHash: "fixture",
                countries: seedCountries,
              },
            ])
          ),
        });
        rows("resetLawPrograms", [
          {
            _id: "law",
            country: countryId,
            scope: "national",
            familyId: "L01",
            fundingAccountId: "account",
            effectiveTurn: 2,
            primaryMetricEffects: [{ metricId: "03", favorableNormalizedPoints: 1 }],
          },
        ]);
        rows("resetDepartmentAccounts", [
          {
            _id: "account",
            countryId,
            accruedThroughTurn: 10,
            lastProgramDelivery: { L01: { implementationFactor: factor } },
          },
        ]);
        rows("federalBudget", [
          {
            _id: "budget",
            countryId,
            gdp: 1000,
            spending: { byCategory: { social: bookedSocial } },
          },
        ]);
        await runMetricEngine(db as unknown as Db, 10);
        const operations = db.collectionMocks.macroMetrics!.bulkWrite.mock.calls.flatMap(
          (call) => call[0]
        );
        const update = operations.find((op) => op.updateOne.filter._id === regionId)?.updateOne
          .update.$set;
        expect(update).toBeDefined();
        return update["economic.povertyRate.value"] as number;
      }
      const unfunded = await run(0);
      const half = await run(0.5);
      const funded = await run(1);
      expect(funded).toBeLessThan(half);
      expect(half).toBeLessThan(unfunded);
      expect(await run(1, 50, 1e9)).toBe(funded);
      expect(await run(1, 10)).toBeGreaterThan(await run(1, 90));
    }
  );
});
