import { describe, expect, it, vi } from "vitest";
import { mergerReviewsCollection } from "./mergerReviews";
import type { CollectionSource } from "./source";

describe("mergerReviews repository", () => {
  it("opens mergerReviews on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = mergerReviewsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("mergerReviews");
    expect(handle).toEqual({ name: "mergerReviews" });
  });
});
