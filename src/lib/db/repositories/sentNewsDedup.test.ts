import { describe, expect, it, vi } from "vitest";
import { sentNewsDedupCollection } from "./sentNewsDedup";
import type { CollectionSource } from "./source";

describe("sentNewsDedup repository", () => {
  it("opens sentNewsDedup on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = sentNewsDedupCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("sentNewsDedup");
    expect(handle).toEqual({ name: "sentNewsDedup" });
  });
});
