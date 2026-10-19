import { describe, expect, it } from "vitest";
import { COMMODITY_BASE_PRICES } from "@/lib/constants/commodities";
import { revenuePerCapacityUnitForStrategy } from "@/lib/constants/capacityEconomy";
import { getStrategyForOperatingModel } from "@/lib/constants/sectorStrategies";
import {
  entertainmentRemovalRescaleRatio,
  REMOVED_ENTERTAINMENT_BASE_PRICE,
  REMOVED_ENTERTAINMENT_MIXES,
} from "./entertainmentRemovalRescale";

const sum = (mix: Readonly<Record<string, number>>) =>
  Object.values(mix).reduce((a, b) => a + (b ?? 0), 0);

function frozenRpu(mix: Readonly<Record<string, number>>): number {
  let k = 0;
  for (const [c, rate] of Object.entries(mix))
    k +=
      rate /
      (c === "entertainment_services"
        ? REMOVED_ENTERTAINMENT_BASE_PRICE
        : COMMODITY_BASE_PRICES[c as keyof typeof COMMODITY_BASE_PRICES]);
  return 1 / k;
}

function split(key: string) {
  const [lane, strategyId] = key.split("/");
  return lane === "media_entertainment"
    ? { sectorType: "media", mediaDiscriminator: "entertainment", strategyId }
    : { sectorType: "media", mediaDiscriminator: null, strategyId };
}

describe("entertainment removal rescale", () => {
  it("keeps each removed mix's value budget in its advertising replacement", () => {
    for (const [key, frozen] of Object.entries(REMOVED_ENTERTAINMENT_MIXES)) {
      const s = split(key);
      const now = getStrategyForOperatingModel(
        s.sectorType,
        s.strategyId,
        undefined,
        s.mediaDiscriminator
      );
      expect(now.id, key).toBe(s.strategyId);
      expect(now.supply.entertainment_services, key).toBeUndefined();
      expect(sum(now.supply), key).toBeCloseTo(sum(frozen), 10);
    }
  });

  it("holds every affected sector's nameplate value: units x RPU is unchanged", () => {
    for (const [key, frozen] of Object.entries(REMOVED_ENTERTAINMENT_MIXES)) {
      const s = split(key);
      const ratio = entertainmentRemovalRescaleRatio(s);
      const rpuNew = revenuePerCapacityUnitForStrategy(
        "media",
        s.strategyId,
        1,
        undefined,
        s.mediaDiscriminator
      );
      expect(1_000 * ratio * rpuNew, key).toBeCloseTo(1_000 * frozenRpu(frozen), 6);
    }
  });

  it("scales the standard entertainment mix by k_new / k_old", () => {
    // 0.2 advertising + 0.4 entertainment becomes 0.6 advertising.
    const pa = COMMODITY_BASE_PRICES.advertising;
    const expected = 0.6 / pa / (0.2 / pa + 0.4 / REMOVED_ENTERTAINMENT_BASE_PRICE);
    expect(
      entertainmentRemovalRescaleRatio({
        sectorType: "media",
        mediaDiscriminator: "entertainment",
        strategyId: null,
      })
    ).toBeCloseTo(expected, 12);
  });

  it("leaves mixes that never carried entertainment alone", () => {
    expect(entertainmentRemovalRescaleRatio({ sectorType: "media", strategyId: "standard" })).toBe(
      1
    );
    expect(
      entertainmentRemovalRescaleRatio({ sectorType: "media", strategyId: "legacy_broadcast" })
    ).toBe(1);
    expect(entertainmentRemovalRescaleRatio({ sectorType: "agriculture", strategyId: null })).toBe(
      1
    );
  });
});
