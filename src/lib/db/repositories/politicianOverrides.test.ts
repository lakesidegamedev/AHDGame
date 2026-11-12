import { describe, expect, it, vi } from "vitest";
import { politicianOverridesCollection } from "./politicianOverrides";
import type { CollectionSource } from "./source";

describe("politicianOverrides repository", () => {
  it("opens politicianOverrides on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = politicianOverridesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("politicianOverrides");
    expect(handle).toEqual({ name: "politicianOverrides" });
  });
});
