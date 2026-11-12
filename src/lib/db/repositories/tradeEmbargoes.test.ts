import { describe, expect, it, vi } from "vitest";
import { tradeEmbargoesCollection } from "./tradeEmbargoes";
import type { CollectionSource } from "./source";

describe("tradeEmbargoes repository", () => {
  it("opens tradeEmbargoes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = tradeEmbargoesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("tradeEmbargoes");
    expect(handle).toEqual({ name: "tradeEmbargoes" });
  });
});
