import { describe, expect, it, vi } from "vitest";
import { caucusChairElectionsCollection } from "./caucusChairElections";
import type { CollectionSource } from "./source";

describe("caucusChairElections repository", () => {
  it("opens caucusChairElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = caucusChairElectionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("caucusChairElections");
    expect(handle).toEqual({ name: "caucusChairElections" });
  });
});
