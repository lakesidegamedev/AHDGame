import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";

const tick = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePreset: vi.fn().mockResolvedValue("2027-default"),
}));
vi.mock("@/lib/turn/parliamentaryGovernment", () => ({
  getParliamentaryCountryIds: vi.fn().mockReturnValue(["UK", "JP", "DE", "FR", "IT"]),
}));
vi.mock("@/lib/uk/confidence/confidenceGaugeStore", () => ({
  tickParliamentaryGovernmentConfidence: tick,
}));
import { runParliamentaryGovernmentConfidencePhase } from "./parliamentaryGovernmentConfidencePhase";

/**
 * Representative per-country phase (#5702): the real tier resolver, reading
 * the rows `seedCountryGameStates` writes, keeps background countries out.
 */
describe("parliamentary confidence skips background countries", () => {
  it("ticks full-simulation countries only", async () => {
    const memory = createInMemoryDb();
    memory.seed("countryGameStates", [
      { _id: "JP", status: "beta", backgroundCountry: false },
      { _id: "DE", status: "beta", backgroundCountry: false },
      { _id: "FR", status: "beta", backgroundCountry: true },
      { _id: "IT", status: "beta", backgroundCountry: true },
    ]);
    await runParliamentaryGovernmentConfidencePhase(memory as unknown as Db, new Date(), 10);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick.mock.calls[0][1].countryIds).toEqual(["JP", "DE"]);
  });

  it("runs every registered country in a world without background rows", async () => {
    tick.mockClear();
    const memory = createInMemoryDb();
    await runParliamentaryGovernmentConfidencePhase(memory as unknown as Db, new Date(), 10);
    expect(tick.mock.calls[0][1].countryIds).toEqual(["JP", "DE", "FR", "IT"]);
  });
});
