import { describe, expect, it, vi } from "vitest";
import { sourceFenceReceiptsCollection } from "./sourceFenceReceipts";
import type { CollectionSource } from "./source";

describe("sourceFenceReceipts repository", () => {
  it("opens sourceFenceReceipts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = sourceFenceReceiptsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("sourceFenceReceipts");
    expect(handle).toEqual({ name: "sourceFenceReceipts" });
  });
});
