import { describe, expect, it, vi } from "vitest";
import { economyResetPlansCollection } from "./economyResetPlans";
import type { CollectionSource } from "./source";

describe("economyResetPlans repository", () => {
  it("opens economyResetPlans on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = economyResetPlansCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("economyResetPlans");
    expect(handle).toEqual({ name: "economyResetPlans" });
  });
});
