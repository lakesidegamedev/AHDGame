import { describe, expect, it, vi } from "vitest";
import { producerPublicCarryCollection } from "./producerPublicCarry";
import type { CollectionSource } from "./source";

describe("producerPublicCarry repository", () => {
  it("opens producerPublicCarry on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerPublicCarryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerPublicCarry");
    expect(handle).toEqual({ name: "producerPublicCarry" });
  });
});
