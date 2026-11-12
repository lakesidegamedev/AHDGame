import { describe, expect, it, vi } from "vitest";
import { federalBudgetSnapshotsCollection } from "./federalBudgetSnapshots";
import type { CollectionSource } from "./source";

describe("federalBudgetSnapshots repository", () => {
  it("opens federalBudgetSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federalBudgetSnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federalBudgetSnapshots");
    expect(handle).toEqual({ name: "federalBudgetSnapshots" });
  });
});
