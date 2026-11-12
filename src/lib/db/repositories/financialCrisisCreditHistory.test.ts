import { describe, expect, it, vi } from "vitest";
import { financialCrisisCreditHistoryCollection } from "./financialCrisisCreditHistory";
import type { CollectionSource } from "./source";

describe("financialCrisisCreditHistory repository", () => {
  it("opens financialCrisisCreditHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = financialCrisisCreditHistoryCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("financialCrisisCreditHistory");
    expect(handle).toEqual({ name: "financialCrisisCreditHistory" });
  });
});
