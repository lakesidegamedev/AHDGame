import { describe, expect, it, vi } from "vitest";
import { russianDumaRepeatOpeningsCollection } from "./russianDumaRepeatOpenings";
import type { CollectionSource } from "./source";

describe("russianDumaRepeatOpenings repository", () => {
  it("opens russianDumaRepeatOpenings on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianDumaRepeatOpeningsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianDumaRepeatOpenings");
    expect(handle).toEqual({ name: "russianDumaRepeatOpenings" });
  });
});
