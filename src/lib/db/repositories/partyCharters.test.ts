import { describe, expect, it, vi } from "vitest";
import { partyChartersCollection } from "./partyCharters";
import type { CollectionSource } from "./source";

describe("partyCharters repository", () => {
  it("opens partyCharters on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyChartersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyCharters");
    expect(handle).toEqual({ name: "partyCharters" });
  });
});
