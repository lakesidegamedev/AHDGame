import { describe, expect, it, vi } from "vitest";
import { conflictCapacityObligationsCollection } from "./conflictCapacityObligations";
import type { CollectionSource } from "./source";

describe("conflictCapacityObligations repository", () => {
  it("opens conflictCapacityObligations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = conflictCapacityObligationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("conflictCapacityObligations");
    expect(handle).toEqual({ name: "conflictCapacityObligations" });
  });
});
