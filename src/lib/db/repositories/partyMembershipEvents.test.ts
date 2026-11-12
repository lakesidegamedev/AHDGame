import { describe, expect, it, vi } from "vitest";
import { partyMembershipEventsCollection } from "./partyMembershipEvents";
import type { CollectionSource } from "./source";

describe("partyMembershipEvents repository", () => {
  it("opens partyMembershipEvents on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyMembershipEventsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyMembershipEvents");
    expect(handle).toEqual({ name: "partyMembershipEvents" });
  });
});
