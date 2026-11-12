import { describe, expect, it, vi } from "vitest";
import { appliedWorldTransitionsCollection } from "./appliedWorldTransitions";
import type { CollectionSource } from "./source";

describe("appliedWorldTransitions repository", () => {
  it("opens appliedWorldTransitions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = appliedWorldTransitionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("appliedWorldTransitions");
    expect(handle).toEqual({ name: "appliedWorldTransitions" });
  });
});
