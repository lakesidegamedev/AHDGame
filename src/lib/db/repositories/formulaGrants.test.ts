import { describe, expect, it, vi } from "vitest";
import { formulaGrantsCollection } from "./formulaGrants";
import type { CollectionSource } from "./source";

describe("formulaGrants repository", () => {
  it("opens formulaGrants on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = formulaGrantsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("formulaGrants");
    expect(handle).toEqual({ name: "formulaGrants" });
  });
});
