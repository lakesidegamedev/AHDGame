import { describe, expect, it, vi } from "vitest";
import { speakerNominationsCollection } from "./speakerNominations";
import type { CollectionSource } from "./source";

describe("speakerNominations repository", () => {
  it("opens speakerNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = speakerNominationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("speakerNominations");
    expect(handle).toEqual({ name: "speakerNominations" });
  });
});
