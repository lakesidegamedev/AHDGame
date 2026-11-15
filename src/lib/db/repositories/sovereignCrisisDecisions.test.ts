import { describe, expect, it, vi } from "vitest";
import { sovereignCrisisDecisionsCollection } from "./sovereignCrisisDecisions";
import type { CollectionSource } from "./source";

describe("sovereignCrisisDecisions repository", () => {
  it("opens sovereignCrisisDecisions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = sovereignCrisisDecisionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("sovereignCrisisDecisions");
    expect(handle).toEqual({ name: "sovereignCrisisDecisions" });
  });
});
