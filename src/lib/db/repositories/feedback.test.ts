import { describe, expect, it, vi } from "vitest";
import { feedbackCollection } from "./feedback";
import type { CollectionSource } from "./source";

describe("feedback repository", () => {
  it("opens feedback on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = feedbackCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("feedback");
    expect(handle).toEqual({ name: "feedback" });
  });
});
