import { describe, expect, it, vi } from "vitest";
import { ledgerReconciliationsCollection } from "./ledgerReconciliations";
import type { CollectionSource } from "./source";

describe("ledgerReconciliations repository", () => {
  it("opens ledgerReconciliations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ledgerReconciliationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ledgerReconciliations");
    expect(handle).toEqual({ name: "ledgerReconciliations" });
  });
});
