import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { loadNetWorth } from "./netWorth";

function cursor(rows: unknown[]) {
  const chain = {
    sort: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    project: vi.fn(() => chain),
    toArray: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

describe("loadNetWorth", () => {
  const userId = new ObjectId().toString();
  const characterId = new ObjectId();

  it("returns net worth oldest first with the home currency rate of each turn", async () => {
    const history = cursor([
      { turn: 12, totalValue: 900, netValue: 800, exchangeRatesSnapshot: { GBP: 0.8, JPY: 150 } },
      { turn: 11, totalValue: 700, exchangeRatesSnapshot: {} },
    ]);
    const find = vi.fn(() => history);
    const db = {
      collection: (name: string) =>
        ({
          users: { findOne: vi.fn().mockResolvedValue({ activeCharacterId: characterId }) },
          characters: { findOne: vi.fn().mockResolvedValue({ countryId: "UK" }) },
          portfolioHistory: { find },
        })[name],
    } as unknown as Db;
    const data = await loadNetWorth(db, userId);
    expect(find).toHaveBeenCalledWith({ characterId });
    expect(history.limit).toHaveBeenCalledWith(12);
    expect(data).toEqual({
      currencyCode: "GBP",
      points: [
        { turn: 11, value: 700, rate: null },
        { turn: 12, value: 800, rate: 0.8 },
      ],
    });
  });

  it("returns null without a character or any history", async () => {
    const noCharacter = {
      collection: () => ({ findOne: vi.fn().mockResolvedValue({}) }),
    } as unknown as Db;
    expect(await loadNetWorth(noCharacter, userId)).toBeNull();
    const noHistory = {
      collection: (name: string) =>
        ({
          users: { findOne: vi.fn().mockResolvedValue({ activeCharacterId: characterId }) },
          characters: { findOne: vi.fn().mockResolvedValue(null) },
          portfolioHistory: { find: () => cursor([]) },
        })[name],
    } as unknown as Db;
    expect(await loadNetWorth(noHistory, userId)).toBeNull();
  });
});
