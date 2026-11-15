import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { buildCountryMacroHistory } from "./countryMacroHistory";
import { buildWorldId } from "@/lib/telemetry/longHorizon/rules";

interface CapturedRead {
  filter: Record<string, unknown>;
  projection: Record<string, unknown> | undefined;
}

type MacroRowInput = { turn: number; year?: number | null; value: number };

function fakeDb(input: {
  gameState: Record<string, unknown> | null;
  rows?: Record<string, MacroRowInput[]>;
}): { db: Db; reads: CapturedRead[] } {
  const reads: CapturedRead[] = [];
  const db = {
    collection(name: string) {
      if (name === "gameState") {
        return { findOne: async () => input.gameState };
      }
      return {
        find(filter: Record<string, unknown>, options?: { projection?: Record<string, unknown> }) {
          reads.push({ filter, projection: options?.projection });
          const rows = input.rows?.[String(filter.metric)] ?? [];
          const cursor = {
            sort: () => cursor,
            limit: () => cursor,
            toArray: async () => rows,
          };
          return cursor;
        },
      };
    },
  };
  return { db: db as unknown as Db, reads };
}

const gameState = {
  _id: "current",
  currentTurn: 700,
  preset: "1991",
  iteration: { type: "multiplayer", number: 2 },
};

describe("buildCountryMacroHistory", () => {
  it("reads only the current world's national rows, projected, one query per metric", async () => {
    const { db, reads } = fakeDb({
      gameState,
      rows: {
        "economic.gdp": [{ turn: 699, year: 1994, value: 5_000_000 }],
        "population.population": [{ turn: 699, year: 1994, value: 100_000_000 }],
      },
    });

    const history = await buildCountryMacroHistory(db, "US", 120);
    const worldId = buildWorldId({
      preset: "1991",
      iterationType: "multiplayer",
      iterationNumber: 2,
    });

    // Two reads, both carrying the full index prefix: world, country, region,
    // metric, then the turn window as the suffix range.
    expect(reads).toHaveLength(2);
    expect(reads.map((read) => read.filter.metric)).toEqual([
      "economic.gdp",
      "population.population",
    ]);
    for (const read of reads) {
      expect(read.filter.worldId).toBe(worldId);
      expect(read.filter.country).toBe("US");
      expect(read.filter.region).toBeNull();
      expect(read.filter.turn).toEqual({ $gte: 581, $lte: 700 });
      expect(read.projection).toEqual({ _id: 0, turn: 1, year: 1, value: 1 });
    }

    expect(history.currentTurn).toBe(700);
    expect(history.turns).toBe(120);
    expect(history.points).toEqual([
      {
        turn: 699,
        year: 1994,
        gdpMillions: 5_000_000,
        population: 100_000_000,
        gdpPerCapita: 50_000,
      },
    ]);
  });

  it("ends the window at the world clock, or at the turn the caller refetched for", async () => {
    const { db, reads } = fakeDb({ gameState });

    // A caller cannot ask for turns that have not happened; a caller that saw a
    // turn complete asks for exactly that turn, which is the cache key it uses.
    await buildCountryMacroHistory(db, "US", 120, 900);
    await buildCountryMacroHistory(db, "US", 120, 690);

    expect(reads.map((read) => read.filter.turn)).toEqual([
      { $gte: 581, $lte: 700 },
      { $gte: 581, $lte: 700 },
      { $gte: 571, $lte: 690 },
      { $gte: 571, $lte: 690 },
    ]);
  });

  it("returns an empty series without reading telemetry when the world has no preset", async () => {
    const { db, reads } = fakeDb({ gameState: { _id: "current", currentTurn: 3 } });

    const history = await buildCountryMacroHistory(db, "JP");

    expect(reads).toHaveLength(0);
    expect(history).toMatchObject({ countryId: "JP", currentTurn: 3, turns: 120, points: [] });
  });
});
