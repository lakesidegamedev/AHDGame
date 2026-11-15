import { describe, expect, it, vi } from "vitest";
import { financialCrisisBankActionsCollection } from "./financialCrisisBankActions";
import type { CollectionSource } from "./source";

describe("financialCrisisBankActions repository", () => {
  it("opens financialCrisisBankActions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = financialCrisisBankActionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("financialCrisisBankActions");
    expect(handle).toEqual({ name: "financialCrisisBankActions" });
  });
});
