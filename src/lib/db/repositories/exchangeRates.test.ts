import { describe, expect, it, vi } from "vitest";
import { exchangeRatesCollection } from "./exchangeRates";
import type { CollectionSource } from "./source";

describe("exchangeRates repository", () => {
  it("opens exchangeRates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = exchangeRatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("exchangeRates");
    expect(handle).toEqual({ name: "exchangeRates" });
  });
});
