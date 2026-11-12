import { describe, expect, it, vi } from "vitest";
import { ukJudicialReviewCasesCollection } from "./ukJudicialReviewCases";
import type { CollectionSource } from "./source";

describe("ukJudicialReviewCases repository", () => {
  it("opens ukJudicialReviewCases on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukJudicialReviewCasesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukJudicialReviewCases");
    expect(handle).toEqual({ name: "ukJudicialReviewCases" });
  });
});
