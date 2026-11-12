import { describe, expect, it, vi } from "vitest";
import { speakerElectionsCollection } from "./speakerElections";
import type { CollectionSource } from "./source";

describe("speakerElections repository", () => {
  it("opens speakerElections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = speakerElectionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("speakerElections");
    expect(handle).toEqual({ name: "speakerElections" });
  });
});
