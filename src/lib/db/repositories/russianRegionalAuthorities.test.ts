import { describe, expect, it, vi } from "vitest";
import { russianRegionalAuthoritiesCollection } from "./russianRegionalAuthorities";
import type { CollectionSource } from "./source";

describe("russianRegionalAuthorities repository", () => {
  it("opens russianRegionalAuthorities on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianRegionalAuthoritiesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianRegionalAuthorities");
    expect(handle).toEqual({ name: "russianRegionalAuthorities" });
  });
});
