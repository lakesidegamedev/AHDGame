import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadFundedBuildDemand } from "./loadFundedBuildDemand";
import { loadBuildRoomContext, supplyMixSharesCountryDemand } from "./buildRoom";

describe("funded build advice queries", () => {
  it("reads one compact epoch-scoped summary and preserves its observed turn", async () => {
    const mock = createMockDb();
    const collection = mock.collection("producerMarketOutcomes");
    collection.findOne.mockResolvedValue({
      turn: 778,
      books: [{ countryId: "UK", commodity: "construction_services", funded: 1080, filled: 72 }],
      regionalBuildBooks: [],
    });
    const source = await loadFundedBuildDemand(mock as unknown as Db, {
      currentTurn: 779,
      worldEpochId: "world",
    });
    expect(source?.turn).toBe(778);
    expect(source?.rows({ construction_services: 1 }, "SCO", "UK").at(-1)?.unmet).toBe(1008);
    expect(collection.findOne).toHaveBeenCalledWith(
      { _id: { $in: ["world:779", "world:778"] } },
      { sort: { turn: -1 }, projection: { turn: 1, books: 1, regionalBuildBooks: 1 } }
    );
    expect(mock.collectionMocks.producerEconomyTurns).toBeUndefined();
  });
  it("leaves regional measurements unknown on a historical receipt", async () => {
    const mock = createMockDb();
    mock.collection("producerMarketOutcomes").findOne.mockResolvedValue({ turn: 778, books: [] });
    const source = await loadFundedBuildDemand(mock as unknown as Db, {
      currentTurn: 778,
      worldEpochId: "world",
    });
    expect(source?.rows({ healthcare_services: 1 }, "SCO", "UK")[0].unmet).toBeNull();
  });
  it("makes the picker use national funded construction demand instead of a zero state ledger", async () => {
    const mock = createMockDb();
    mock
      .collection("gameState")
      .findOne.mockResolvedValue({ currentTurn: 778, worldEpochId: "world" });
    mock.collection("producerMarketOutcomes").findOne.mockResolvedValue({
      turn: 778,
      books: [{ countryId: "UK", commodity: "construction_services", funded: 1080, filled: 72 }],
      regionalBuildBooks: [],
    });
    mock.collection("commodityPrices").find.mockReturnValue({
      toArray: async () => [
        { commodity: "construction_services", stateSupply: { SCO: 0 }, stateDemand: { SCO: 0 } },
      ],
    });
    const context = await loadBuildRoomContext(mock as unknown as Db);
    expect(context.demandGapUnits({ construction_services: 1 }, "SCO", "UK")).toBe(1008);
    expect(supplyMixSharesCountryDemand({ construction_services: 1 }, context.funded)).toBe(true);
    expect(supplyMixSharesCountryDemand({ healthcare_services: 1 }, context.funded)).toBe(false);
    expect(supplyMixSharesCountryDemand({ construction_services: 1 })).toBe(false);
  });
});
