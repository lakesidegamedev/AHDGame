import { describe, expect, it, vi } from "vitest";
import { demographicFlowProjectionsCollection } from "./demographicFlowProjections";
import type { CollectionSource } from "./source";

describe("demographicFlowProjections repository", () => {
  it("opens demographicFlowProjections on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = demographicFlowProjectionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("demographicFlowProjections");
    expect(handle).toEqual({ name: "demographicFlowProjections" });
  });
});
