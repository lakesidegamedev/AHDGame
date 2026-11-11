import { describe, expect, it, vi } from "vitest";
import { countryAlignmentsCollection } from "./countryAlignments";
import type { CollectionSource } from "./source";

describe("countryAlignments repository", () => {
  it("opens countryAlignments on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = countryAlignmentsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("countryAlignments");
    expect(handle).toEqual({ name: "countryAlignments" });
  });
});
