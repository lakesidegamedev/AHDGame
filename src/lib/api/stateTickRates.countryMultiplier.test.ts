import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { getFederalMultiplier } from "@shared/constants/formulas";

// The drift helper hits the DB; stub it to null (non-devolved region) so the tick-rate
// computation returns cleanly under the mock DB.
vi.mock("@/lib/turn/independenceDesireDrift", () => ({
  computeIndependenceDesireDriftForRegion: vi.fn().mockResolvedValue(null),
}));

function cursor<T>(rows: T[]) {
  return {
    toArray: vi.fn().mockResolvedValue(rows),
    project: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
  };
}

describe("computeStateTickRates — country-aware national scope multiplier", () => {
  let db: MockDb;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
    db.collection("statePolicies");
    db.collection("states");
    db.collection("legislationTypes");
  });

  it("divides a national policy's tick by its own country's region count, not the US 1/50", async () => {
    const rate = 0.75;
    const natalist = {
      _id: "jp_test_natalist",
      countryScope: "jp",
      name: "Test Natalist Act",
      policyOptions: [
        {
          id: "jp_test_natalist_strong",
          name: "Strong",
          effectDirection: 1,
          metricEffects: [{ category: "population", metricId: "birthRate", ratePerTurn: rate }],
        },
      ],
    };

    db.collectionMocks.statePolicies.find.mockReturnValue(
      cursor([
        {
          stateId: "jp_national",
          legislationTypeId: "jp_test_natalist",
          policyOptionId: "jp_test_natalist_strong",
          effectDirection: 1,
        },
      ])
    );
    db.collectionMocks.states.findOne.mockResolvedValue({ _id: "KAN", countryId: "JP" });
    db.collectionMocks.legislationTypes.find.mockReturnValue(cursor([natalist]));

    const { computeStateTickRates } = await import("./stateTickRates");
    const rates = await computeStateTickRates(db as unknown as Db, "KAN", "JP");

    expect(getFederalMultiplier("JP")).not.toBe(getFederalMultiplier("US"));
    expect(rates.population?.birthRate).toBeCloseTo(rate * getFederalMultiplier("JP"), 6);
  });
});
