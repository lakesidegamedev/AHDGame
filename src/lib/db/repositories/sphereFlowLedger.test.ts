import { describe, expect, it, vi } from "vitest";
import { sphereFlowLedgerCollection } from "./sphereFlowLedger";
import type { CollectionSource } from "./source";

describe("sphereFlowLedger repository", () => {
  it("opens sphereFlowLedger on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = sphereFlowLedgerCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("sphereFlowLedger");
    expect(handle).toEqual({ name: "sphereFlowLedger" });
  });
});
