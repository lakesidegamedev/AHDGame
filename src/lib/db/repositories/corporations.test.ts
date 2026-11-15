import { describe, expect, it, vi } from "vitest";
import { corporationsCollection } from "./corporations";
import type { CollectionSource } from "./source";

describe("corporations repository", () => {
  it("opens corporations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporations");
    expect(handle).toEqual({ name: "corporations" });
  });
});
