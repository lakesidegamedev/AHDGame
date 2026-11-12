import { describe, expect, it, vi } from "vitest";
import { supplyAgreementsCollection } from "./supplyAgreements";
import type { CollectionSource } from "./source";

describe("supplyAgreements repository", () => {
  it("opens supplyAgreements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = supplyAgreementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("supplyAgreements");
    expect(handle).toEqual({ name: "supplyAgreements" });
  });
});
