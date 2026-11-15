import { describe, expect, it, vi } from "vitest";
import { authSourceOwnershipProofsCollection } from "./authSourceOwnershipProofs";
import type { CollectionSource } from "./source";

describe("authSourceOwnershipProofs repository", () => {
  it("opens authSourceOwnershipProofs on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = authSourceOwnershipProofsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("authSourceOwnershipProofs");
    expect(handle).toEqual({ name: "authSourceOwnershipProofs" });
  });
});
