import { describe, expect, it, vi } from "vitest";
import { wikiPagesCollection } from "./wikiPages";
import type { CollectionSource } from "./source";

describe("wikiPages repository", () => {
  it("opens wikiPages on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = wikiPagesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("wikiPages");
    expect(handle).toEqual({ name: "wikiPages" });
  });
});
