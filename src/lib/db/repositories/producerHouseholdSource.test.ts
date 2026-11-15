import { describe, expect, it, vi } from "vitest";
import { producerHouseholdSourceCollection } from "./producerHouseholdSource";
import type { CollectionSource } from "./source";

describe("producerHouseholdSource repository", () => {
  it("opens producerHouseholdSource on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerHouseholdSourceCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerHouseholdSource");
    expect(handle).toEqual({ name: "producerHouseholdSource" });
  });
});
