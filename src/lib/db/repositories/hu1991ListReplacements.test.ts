import { describe, expect, it, vi } from "vitest";
import { hu1991ListReplacementsCollection } from "./hu1991ListReplacements";
import type { CollectionSource } from "./source";

describe("hu1991ListReplacements repository", () => {
  it("opens hu1991ListReplacements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu1991ListReplacementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu1991ListReplacements");
    expect(handle).toEqual({ name: "hu1991ListReplacements" });
  });
});
