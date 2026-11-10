import { describe, expect, it } from "vitest";
import {
  FRONTIER_RACES,
  LICENCE_STRENGTH,
  METHOD_PLANT_OUTPUT_PCT,
  SUNSET_TURNS,
  clampOrderPoints,
  conversionReturn,
  countryOrderCost,
  entrantKey,
  methodPlantOutputPct,
  parseEntrantKey,
  pickWinner,
  rankEntrants,
  raceStatus,
  resolveRace,
} from "./rules";

describe("frontier race rules", () => {
  it("opens each race on its year", () => {
    const fusion = FRONTIER_RACES[0];
    expect(raceStatus(fusion, fusion.opensYear - 1, null)).toBe("pending");
    expect(raceStatus(fusion, fusion.opensYear, null)).toBe("open");
    expect(raceStatus(fusion, fusion.opensYear, { key: "x" })).toBe("won");
  });

  it("round trips entrant keys and rejects junk", () => {
    expect(parseEntrantKey(entrantKey("country", "US"))).toEqual({ kind: "country", id: "US" });
    expect(parseEntrantKey("nonsense")).toBeNull();
    expect(parseEntrantKey("planet:Mars")).toBeNull();
  });

  it("clamps orders to whole points under the cap", () => {
    expect(clampOrderPoints(5.9)).toBe(5);
    expect(clampOrderPoints(-3)).toBe(0);
    expect(clampOrderPoints(1e9)).toBe(1000);
    expect(clampOrderPoints(Number.NaN)).toBe(0);
    expect(countryOrderCost(2)).toBe(50_000_000);
  });

  it("ranks by points with a stable tie break", () => {
    const ranked = rankEntrants(
      { "country:B": 100, "country:A": 100, "corporation:c1": 300 },
      1000
    );
    expect(ranked.map((r) => r.key)).toEqual(["corporation:c1", "country:A", "country:B"]);
    expect(ranked[0].progress).toBeCloseTo(0.3);
  });

  it("names no winner until the leader reaches the threshold", () => {
    expect(pickWinner({ "country:US": 999 }, 1000)).toBeNull();
    expect(pickWinner({ "country:US": 1000, "country:CN": 400 }, 1000)?.key).toBe("country:US");
  });

  it("keeps only meaningful losers and sets the licence turn", () => {
    const outcome = resolveRace(
      { "country:US": 1000, "country:CN": 400, "corporation:c1": 100 },
      1000,
      10
    );
    expect(outcome?.winner.key).toBe("country:US");
    expect(outcome?.losers.map((l) => l.key)).toEqual(["country:CN"]);
    expect(outcome?.licenceTurn).toBe(10 + SUNSET_TURNS);
  });

  it("weights a licence below a won method", () => {
    expect(methodPlantOutputPct(["winner"])).toBeCloseTo(METHOD_PLANT_OUTPUT_PCT);
    expect(methodPlantOutputPct(["licence"])).toBeCloseTo(
      METHOD_PLANT_OUTPUT_PCT * LICENCE_STRENGTH
    );
    expect(methodPlantOutputPct([])).toBe(0);
  });

  it("returns part of a loser's research points", () => {
    expect(conversionReturn(1000)).toBe(400);
    expect(conversionReturn(-5)).toBe(0);
  });
});

import { frontierMethodEffects } from "./rules";
describe("frontierMethodEffects", () => {
  it("turns held methods into one plant output effect", () => {
    expect(frontierMethodEffects({ fusion: "winner", orbital: "licence" })).toEqual([
      { kind: "plantOutput", pct: METHOD_PLANT_OUTPUT_PCT * 1.5 },
    ]);
    expect(frontierMethodEffects(undefined)).toEqual([]);
  });
});
