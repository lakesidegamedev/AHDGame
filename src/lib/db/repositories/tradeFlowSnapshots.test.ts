import { describe, expect, it, vi } from "vitest";
import { tradeFlowSnapshotsCollection } from "./tradeFlowSnapshots";
import type { CollectionSource } from "./source";

describe("tradeFlowSnapshots repository", () => {
  it("opens tradeFlowSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = tradeFlowSnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("tradeFlowSnapshots");
    expect(handle).toEqual({ name: "tradeFlowSnapshots" });
  });
});
