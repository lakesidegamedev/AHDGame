import { describe, expect, it, vi } from "vitest";
import { partyMembersCollection } from "./partyMembers";
import type { CollectionSource } from "./source";

describe("partyMembers repository", () => {
  it("opens partyMembers on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyMembersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyMembers");
    expect(handle).toEqual({ name: "partyMembers" });
  });
});
