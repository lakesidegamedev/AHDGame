import { describe, expect, it } from "vitest";
import { MAX_UNIVERSAL_SEARCH_QUERY_LENGTH } from "./universalSearch";

describe("universal search limits", () => {
  it("caps the accepted query length at 200 characters", () => {
    expect(MAX_UNIVERSAL_SEARCH_QUERY_LENGTH).toBe(200);
  });
});
