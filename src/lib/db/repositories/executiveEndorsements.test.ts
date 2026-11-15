import { describe, expect, it, vi } from "vitest";
import { executiveEndorsementsCollection } from "./executiveEndorsements";
import type { CollectionSource } from "./source";

describe("executiveEndorsements repository", () => {
  it("opens executiveEndorsements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = executiveEndorsementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("executiveEndorsements");
    expect(handle).toEqual({ name: "executiveEndorsements" });
  });
});
