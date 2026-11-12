import { describe, expect, it, vi } from "vitest";
import { cabinetMembersCollection } from "./cabinetMembers";
import type { CollectionSource } from "./source";

describe("cabinetMembers repository", () => {
  it("opens cabinetMembers on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = cabinetMembersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("cabinetMembers");
    expect(handle).toEqual({ name: "cabinetMembers" });
  });
});
