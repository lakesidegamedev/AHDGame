import { describe, expect, it, vi } from "vitest";
import { corporationShareInvitesCollection } from "./corporationShareInvites";
import type { CollectionSource } from "./source";

describe("corporationShareInvites repository", () => {
  it("opens corporationShareInvites on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporationShareInvitesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporationShareInvites");
    expect(handle).toEqual({ name: "corporationShareInvites" });
  });
});
