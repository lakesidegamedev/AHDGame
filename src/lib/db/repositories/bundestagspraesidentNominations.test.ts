import { describe, expect, it, vi } from "vitest";
import { bundestagspraesidentNominationsCollection } from "./bundestagspraesidentNominations";
import type { CollectionSource } from "./source";

describe("bundestagspraesidentNominations repository", () => {
  it("opens bundestagspraesidentNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bundestagspraesidentNominationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bundestagspraesidentNominations");
    expect(handle).toEqual({ name: "bundestagspraesidentNominations" });
  });
});
