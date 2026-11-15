import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import {
  democraticSpreadSnapshot,
  invalidateSovereignPricingSnapshot,
  withSovereignPricingSnapshot,
} from "./sovereignPricingSnapshot";

describe("sovereign political pricing snapshots", () => {
  it("shares concurrent reads by world and country, refreshes after political actions and between phases", async () => {
    const one = createInMemoryDb() as unknown as Db;
    const two = createInMemoryDb() as unknown as Db;
    const load = vi.fn().mockResolvedValue(0.25);
    await withSovereignPricingSnapshot(async () => {
      expect(
        await Promise.all([
          democraticSpreadSnapshot(one, "CA", load),
          democraticSpreadSnapshot(one, "CA", load),
        ])
      ).toEqual([0.25, 0.25]);
      expect(load).toHaveBeenCalledTimes(1);
      await democraticSpreadSnapshot(one, "US", load);
      await democraticSpreadSnapshot(two, "CA", load);
      expect(load).toHaveBeenCalledTimes(3);
      invalidateSovereignPricingSnapshot();
      await democraticSpreadSnapshot(one, "CA", load);
      expect(load).toHaveBeenCalledTimes(4);
    });
    await withSovereignPricingSnapshot(() => democraticSpreadSnapshot(one, "CA", load));
    await democraticSpreadSnapshot(one, "CA", load);
    expect(load).toHaveBeenCalledTimes(6);
  });
});
