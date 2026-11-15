import { describe, expect, it, vi } from "vitest";
import { prospectingSurveysCollection } from "./prospectingSurveys";
import type { CollectionSource } from "./source";

describe("prospectingSurveys repository", () => {
  it("opens prospectingSurveys on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = prospectingSurveysCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("prospectingSurveys");
    expect(handle).toEqual({ name: "prospectingSurveys" });
  });
});
