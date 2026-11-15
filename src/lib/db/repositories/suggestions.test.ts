import { describe, expect, it, vi } from "vitest";
import { suggestionsCollection } from "./suggestions";
import type { CollectionSource } from "./source";

describe("suggestions repository", () => {
  it("opens suggestions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = suggestionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("suggestions");
    expect(handle).toEqual({ name: "suggestions" });
  });
});
