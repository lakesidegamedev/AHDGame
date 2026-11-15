import { describe, expect, it, vi } from "vitest";
import { committeeAssignmentsCollection } from "./committeeAssignments";
import type { CollectionSource } from "./source";

describe("committeeAssignments repository", () => {
  it("opens committeeAssignments on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = committeeAssignmentsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("committeeAssignments");
    expect(handle).toEqual({ name: "committeeAssignments" });
  });
});
