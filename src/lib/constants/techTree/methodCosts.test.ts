import { describe, expect, it } from "vitest";
import { SECTOR_STRATEGIES } from "@/lib/constants/sectorStrategyDefinitions";
import { TECH_DECADES } from "./decades";

/** Methods a tier from 2039 on opens. No new method is free. */
const newMethods = Object.entries(SECTOR_STRATEGIES).flatMap(([sector, strategies]) =>
  strategies
    .filter((s) => s.minDecade != null && Number(s.minDecade) >= 2039)
    .map((s) => ({ sector, strategy: s }))
);

describe("every method opened from 2039 on records its cost", () => {
  it("finds the late-tier methods", () => {
    expect(newMethods.length).toBeGreaterThanOrEqual(18);
    for (const { strategy } of newMethods) {
      expect(TECH_DECADES.map((d) => d.id)).toContain(strategy.minDecade);
    }
  });

  it.each(newMethods.map((m) => [`${m.sector}/${m.strategy.id}`, m.strategy] as const))(
    "%s has inputs, a build time and a downside",
    (_name, strategy) => {
      expect(Object.keys(strategy.demand).length, "inputs").toBeGreaterThanOrEqual(3);
      for (const rate of Object.values(strategy.demand)) expect(rate).toBeGreaterThan(0);
      expect(Number.isInteger(strategy.buildTurns), "buildTurns").toBe(true);
      expect(strategy.buildTurns).toBeGreaterThan(0);
      expect((strategy.downside ?? "").trim().length, "downside").toBeGreaterThan(20);
    }
  );

  it("keeps advanced fission to a four-year build", () => {
    const fission = SECTOR_STRATEGIES.energy.find((s) => s.id === "advanced_fission");
    expect(fission?.buildTurns).toBe(4 * 48);
  });
});
