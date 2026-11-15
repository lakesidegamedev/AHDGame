import { describe, expect, it, vi } from "vitest";
import { bgOrdinaryElectionPlansCollection } from "./bgOrdinaryElectionPlans";
import type { CollectionSource } from "./source";

describe("bgOrdinaryElectionPlans repository", () => {
  it("opens bgOrdinaryElectionPlans on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bgOrdinaryElectionPlansCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bgOrdinaryElectionPlans");
    expect(handle).toEqual({ name: "bgOrdinaryElectionPlans" });
  });
});
