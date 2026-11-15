import { describe, expect, it, vi } from "vitest";
import { producerMarketShadowStateCollection } from "./producerMarketShadowState";
import type { CollectionSource } from "./source";

describe("producerMarketShadowState repository", () => {
  it("opens producerMarketShadowState on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerMarketShadowStateCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerMarketShadowState");
    expect(handle).toEqual({ name: "producerMarketShadowState" });
  });
});
