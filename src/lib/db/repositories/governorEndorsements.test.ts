import { describe, expect, it, vi } from "vitest";
import { governorEndorsementsCollection } from "./governorEndorsements";
import type { CollectionSource } from "./source";

describe("governorEndorsements repository", () => {
  it("opens governorEndorsements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governorEndorsementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governorEndorsements");
    expect(handle).toEqual({ name: "governorEndorsements" });
  });
});
