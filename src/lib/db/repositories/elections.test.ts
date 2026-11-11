import { describe, expect, it, vi } from "vitest";
import { electionsCollection } from "./elections";
import type { CollectionSource } from "./source";

describe("elections repository", () => {
  it("opens elections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = electionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("elections");
    expect(handle).toEqual({ name: "elections" });
  });
});
