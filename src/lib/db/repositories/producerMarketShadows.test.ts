import { describe, expect, it, vi } from "vitest";
import { producerMarketShadowsCollection } from "./producerMarketShadows";
import type { CollectionSource } from "./source";

describe("producerMarketShadows repository", () => {
  it("opens producerMarketShadows on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerMarketShadowsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerMarketShadows");
    expect(handle).toEqual({ name: "producerMarketShadows" });
  });
});
