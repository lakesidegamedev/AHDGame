import { describe, expect, it, vi } from "vitest";
import { patreonReconcileRunsCollection } from "./patreonReconcileRuns";
import type { CollectionSource } from "./source";

describe("patreonReconcileRuns repository", () => {
  it("opens patreonReconcileRuns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = patreonReconcileRunsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("patreonReconcileRuns");
    expect(handle).toEqual({ name: "patreonReconcileRuns" });
  });
});
