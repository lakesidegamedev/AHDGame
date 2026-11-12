import { describe, expect, it, vi } from "vitest";
import { statePartyOrgCollection } from "./statePartyOrg";
import type { CollectionSource } from "./source";

describe("statePartyOrg repository", () => {
  it("opens statePartyOrg on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = statePartyOrgCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("statePartyOrg");
    expect(handle).toEqual({ name: "statePartyOrg" });
  });
});
