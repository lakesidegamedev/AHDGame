import { describe, expect, it, vi } from "vitest";
import { stateBaselinesCollection } from "./stateBaselines";
import type { CollectionSource } from "./source";

describe("stateBaselines repository", () => {
  it("opens stateBaselines on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateBaselinesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateBaselines");
    expect(handle).toEqual({ name: "stateBaselines" });
  });
});
