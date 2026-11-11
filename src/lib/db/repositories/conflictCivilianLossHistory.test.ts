import { describe, expect, it, vi } from "vitest";
import { conflictCivilianLossHistoryCollection } from "./conflictCivilianLossHistory";
import type { CollectionSource } from "./source";

describe("conflictCivilianLossHistory repository", () => {
  it("opens conflictCivilianLossHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = conflictCivilianLossHistoryCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("conflictCivilianLossHistory");
    expect(handle).toEqual({ name: "conflictCivilianLossHistory" });
  });
});
