import { describe, expect, it, vi } from "vitest";
import { bundestagspraesidentElectionsCollection } from "./bundestagspraesidentElections";
import type { CollectionSource } from "./source";

describe("bundestagspraesidentElections repository", () => {
  it("opens bundestagspraesidentElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bundestagspraesidentElectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bundestagspraesidentElections");
    expect(handle).toEqual({ name: "bundestagspraesidentElections" });
  });
});
