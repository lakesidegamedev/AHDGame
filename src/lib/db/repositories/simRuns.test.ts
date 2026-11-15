import { describe, expect, it, vi } from "vitest";
import { simRunsCollection } from "./simRuns";
import type { CollectionSource } from "./source";

describe("simRuns repository", () => {
  it("opens simRuns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = simRunsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("simRuns");
    expect(handle).toEqual({ name: "simRuns" });
  });
});
