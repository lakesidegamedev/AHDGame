import { describe, expect, it, vi } from "vitest";
import { producerMarketOutcomesCollection } from "./producerMarketOutcomes";
import type { CollectionSource } from "./source";

describe("producerMarketOutcomes repository", () => {
  it("opens producerMarketOutcomes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerMarketOutcomesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerMarketOutcomes");
    expect(handle).toEqual({ name: "producerMarketOutcomes" });
  });
});
