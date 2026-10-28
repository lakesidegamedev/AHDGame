import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listPatreonTiers } = vi.hoisted(() => ({ listPatreonTiers: vi.fn() }));
vi.mock("@/lib/patreon/members", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/patreon/members")>();
  return { ...actual, listPatreonTiers };
});

import { getPatreonTierPrices, resetPatreonTierPriceCache } from "./tierPrices";

describe("getPatreonTierPrices", () => {
  beforeEach(() => {
    resetPatreonTierPriceCache();
    listPatreonTiers.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("maps live Patreon tiers by id and keeps cheapest-first order", async () => {
    listPatreonTiers.mockResolvedValue([
      { tierId: "29087694", title: "Champion", amountCents: 2500, published: true },
      { tierId: "28289286", title: "Supporter", amountCents: 300, published: true },
      { tierId: "28289222", title: "Free", amountCents: 0, published: true },
    ]);
    const tiers = await getPatreonTierPrices();
    expect(tiers.map((t) => [t.key, t.priceLabel])).toEqual([
      ["supporter", "$3.00 / month"],
      ["supporter-plus", "$9.99 / month"],
      ["supporter-plus-plus", "$25.00 / month"],
    ]);
  });

  it("caches for an hour", async () => {
    listPatreonTiers.mockResolvedValue([]);
    await getPatreonTierPrices();
    await getPatreonTierPrices();
    expect(listPatreonTiers).toHaveBeenCalledTimes(1);
  });

  it("falls back to the known price list when Patreon fails", async () => {
    listPatreonTiers.mockRejectedValue(new Error("down"));
    const tiers = await getPatreonTierPrices();
    expect(tiers.map((t) => t.amountCents)).toEqual([300, 999, 2000]);
  });
});
