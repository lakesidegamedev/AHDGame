import { describe, expect, it, vi } from "vitest";
import { strategicSectorDesignationsCollection } from "./strategicSectorDesignations";
import type { CollectionSource } from "./source";

describe("strategicSectorDesignations repository", () => {
  it("opens strategicSectorDesignations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = strategicSectorDesignationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("strategicSectorDesignations");
    expect(handle).toEqual({ name: "strategicSectorDesignations" });
  });
});
