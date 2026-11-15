import { describe, expect, it, vi } from "vitest";
import { russianCouncilCompositionSeatingsCollection } from "./russianCouncilCompositionSeatings";
import type { CollectionSource } from "./source";

describe("russianCouncilCompositionSeatings repository", () => {
  it("opens russianCouncilCompositionSeatings on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianCouncilCompositionSeatingsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianCouncilCompositionSeatings");
    expect(handle).toEqual({ name: "russianCouncilCompositionSeatings" });
  });
});
