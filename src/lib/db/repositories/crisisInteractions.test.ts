import { describe, expect, it, vi } from "vitest";
import { crisisInteractionsCollection } from "./crisisInteractions";
import type { CollectionSource } from "./source";

describe("crisisInteractions repository", () => {
  it("opens crisisInteractions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = crisisInteractionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("crisisInteractions");
    expect(handle).toEqual({ name: "crisisInteractions" });
  });
});
