import { describe, expect, it, vi } from "vitest";
import { producerEconomyTurnsCollection } from "./producerEconomyTurns";
import type { CollectionSource } from "./source";

describe("producerEconomyTurns repository", () => {
  it("opens producerEconomyTurns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerEconomyTurnsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerEconomyTurns");
    expect(handle).toEqual({ name: "producerEconomyTurns" });
  });
});
