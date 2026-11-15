import { describe, expect, it, vi } from "vitest";
import { governmentApprovalsCollection } from "./governmentApprovals";
import type { CollectionSource } from "./source";

describe("governmentApprovals repository", () => {
  it("opens governmentApprovals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governmentApprovalsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governmentApprovals");
    expect(handle).toEqual({ name: "governmentApprovals" });
  });
});
