import { describe, expect, it, vi } from "vitest";
import { producerEconomyTurnChunksCollection } from "./producerEconomyTurnChunks";
import type { CollectionSource } from "./source";

describe("producerEconomyTurnChunks repository", () => {
  it("opens producerEconomyTurnChunks on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerEconomyTurnChunksCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerEconomyTurnChunks");
    expect(handle).toEqual({ name: "producerEconomyTurnChunks" });
  });
});
