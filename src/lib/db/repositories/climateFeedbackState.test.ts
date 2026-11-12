import { describe, expect, it, vi } from "vitest";
import { climateFeedbackStateCollection } from "./climateFeedbackState";
import type { CollectionSource } from "./source";

describe("climateFeedbackState repository", () => {
  it("opens climateFeedbackState on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = climateFeedbackStateCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("climateFeedbackState");
    expect(handle).toEqual({ name: "climateFeedbackState" });
  });
});
