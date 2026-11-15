import { describe, expect, it, vi } from "vitest";
import { characterStateOrgCollection } from "./characterStateOrg";
import type { CollectionSource } from "./source";

describe("characterStateOrg repository", () => {
  it("opens characterStateOrg on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = characterStateOrgCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("characterStateOrg");
    expect(handle).toEqual({ name: "characterStateOrg" });
  });
});
