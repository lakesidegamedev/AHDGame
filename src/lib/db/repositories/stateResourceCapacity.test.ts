import { describe, expect, it, vi } from "vitest";
import { stateResourceCapacityCollection } from "./stateResourceCapacity";
import type { CollectionSource } from "./source";

describe("stateResourceCapacity repository", () => {
  it("opens stateResourceCapacity on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateResourceCapacityCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateResourceCapacity");
    expect(handle).toEqual({ name: "stateResourceCapacity" });
  });
});
