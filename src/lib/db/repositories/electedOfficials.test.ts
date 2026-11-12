import { describe, expect, it, vi } from "vitest";
import { electedOfficialsCollection } from "./electedOfficials";
import type { CollectionSource } from "./source";

describe("electedOfficials repository", () => {
  it("opens electedOfficials on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = electedOfficialsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("electedOfficials");
    expect(handle).toEqual({ name: "electedOfficials" });
  });
});
