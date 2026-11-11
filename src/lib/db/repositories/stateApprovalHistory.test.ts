import { describe, expect, it, vi } from "vitest";
import { stateApprovalHistoryCollection } from "./stateApprovalHistory";
import type { CollectionSource } from "./source";

describe("stateApprovalHistory repository", () => {
  it("opens stateApprovalHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateApprovalHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateApprovalHistory");
    expect(handle).toEqual({ name: "stateApprovalHistory" });
  });
});
