import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { getMarketSystemMode, getMarketSystemModeForDb } from "./featureFlag";

describe("the market tier is fixed at plants", () => {
  const stored = ["off", "realization", "ledger", "clearing", "capital", "garbage", undefined];

  it.each(stored)("ignores a stored value of %s when a config is passed", async (value) => {
    await expect(
      getMarketSystemMode({ marketSystemMode: value } as Parameters<typeof getMarketSystemMode>[0])
    ).resolves.toBe("plants");
  });

  it("does not need a config or a database", async () => {
    await expect(getMarketSystemMode(null)).resolves.toBe("plants");
    await expect(getMarketSystemModeForDb({} as unknown as Db)).resolves.toBe("plants");
  });
});
