import { describe, expect, it, vi } from "vitest";
import { fomcNominationsCollection } from "./fomcNominations";
import type { CollectionSource } from "./source";

describe("fomcNominations repository", () => {
  it("opens fomcNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = fomcNominationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("fomcNominations");
    expect(handle).toEqual({ name: "fomcNominations" });
  });
});
