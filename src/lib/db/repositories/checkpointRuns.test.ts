import { describe, expect, it, vi } from "vitest";
import { checkpointRunsCollection } from "./checkpointRuns";
import type { CollectionSource } from "./source";

describe("checkpointRuns repository", () => {
  it("opens checkpointRuns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = checkpointRunsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("checkpointRuns");
    expect(handle).toEqual({ name: "checkpointRuns" });
  });
});
