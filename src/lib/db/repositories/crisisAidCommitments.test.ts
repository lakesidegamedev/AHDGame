import { describe, expect, it, vi } from "vitest";
import { crisisAidCommitmentsCollection } from "./crisisAidCommitments";
import type { CollectionSource } from "./source";

describe("crisisAidCommitments repository", () => {
  it("opens crisisAidCommitments on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = crisisAidCommitmentsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("crisisAidCommitments");
    expect(handle).toEqual({ name: "crisisAidCommitments" });
  });
});
