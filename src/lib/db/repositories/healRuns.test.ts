import { describe, expect, it, vi } from "vitest";
import { healRunsCollection } from "./healRuns";
import type { CollectionSource } from "./source";

describe("healRuns repository", () => {
  it("opens healRuns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = healRunsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("healRuns");
    expect(handle).toEqual({ name: "healRuns" });
  });
});
