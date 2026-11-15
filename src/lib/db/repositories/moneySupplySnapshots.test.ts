import { describe, expect, it, vi } from "vitest";
import { moneySupplySnapshotsCollection } from "./moneySupplySnapshots";
import type { CollectionSource } from "./source";

describe("moneySupplySnapshots repository", () => {
  it("opens moneySupplySnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = moneySupplySnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("moneySupplySnapshots");
    expect(handle).toEqual({ name: "moneySupplySnapshots" });
  });
});
