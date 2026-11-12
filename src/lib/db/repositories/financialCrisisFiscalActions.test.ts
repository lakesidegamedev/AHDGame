import { describe, expect, it, vi } from "vitest";
import { financialCrisisFiscalActionsCollection } from "./financialCrisisFiscalActions";
import type { CollectionSource } from "./source";

describe("financialCrisisFiscalActions repository", () => {
  it("opens financialCrisisFiscalActions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = financialCrisisFiscalActionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("financialCrisisFiscalActions");
    expect(handle).toEqual({ name: "financialCrisisFiscalActions" });
  });
});
