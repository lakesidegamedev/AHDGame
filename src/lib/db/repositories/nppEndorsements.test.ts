import { describe, expect, it, vi } from "vitest";
import { nppEndorsementsCollection } from "./nppEndorsements";
import type { CollectionSource } from "./source";

describe("nppEndorsements repository", () => {
  it("opens nppEndorsements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nppEndorsementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nppEndorsements");
    expect(handle).toEqual({ name: "nppEndorsements" });
  });
});
