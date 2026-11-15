import { describe, expect, it, vi } from "vitest";
import { producerPathClaimsCollection } from "./producerPathClaims";
import type { CollectionSource } from "./source";

describe("producerPathClaims repository", () => {
  it("opens producerPathClaims on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerPathClaimsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerPathClaims");
    expect(handle).toEqual({ name: "producerPathClaims" });
  });
});
