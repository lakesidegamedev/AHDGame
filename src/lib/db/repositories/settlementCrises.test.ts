import { describe, expect, it, vi } from "vitest";
import { settlementCrisesCollection } from "./settlementCrises";
import type { CollectionSource } from "./source";

describe("settlementCrises repository", () => {
  it("opens settlementCrises on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = settlementCrisesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("settlementCrises");
    expect(handle).toEqual({ name: "settlementCrises" });
  });
});
