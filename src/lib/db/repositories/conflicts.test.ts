import { describe, expect, it, vi } from "vitest";
import { conflictsCollection } from "./conflicts";
import type { CollectionSource } from "./source";

describe("conflicts repository", () => {
  it("opens conflicts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = conflictsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("conflicts");
    expect(handle).toEqual({ name: "conflicts" });
  });
});
