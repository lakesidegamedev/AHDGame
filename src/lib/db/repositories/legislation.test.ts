import { describe, expect, it, vi } from "vitest";
import { legislationCollection } from "./legislation";
import type { CollectionSource } from "./source";

describe("legislation repository", () => {
  it("opens legislation on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = legislationCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("legislation");
    expect(handle).toEqual({ name: "legislation" });
  });
});
