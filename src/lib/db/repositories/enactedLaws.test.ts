import { describe, expect, it, vi } from "vitest";
import { enactedLawsCollection } from "./enactedLaws";
import type { CollectionSource } from "./source";

describe("enactedLaws repository", () => {
  it("opens enactedLaws on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = enactedLawsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("enactedLaws");
    expect(handle).toEqual({ name: "enactedLaws" });
  });
});
