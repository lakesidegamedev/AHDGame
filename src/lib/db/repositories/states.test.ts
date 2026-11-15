import { describe, expect, it, vi } from "vitest";
import { statesCollection } from "./states";
import type { CollectionSource } from "./source";

describe("states repository", () => {
  it("opens states on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = statesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("states");
    expect(handle).toEqual({ name: "states" });
  });
});
