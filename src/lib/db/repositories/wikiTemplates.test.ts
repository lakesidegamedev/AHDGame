import { describe, expect, it, vi } from "vitest";
import { wikiTemplatesCollection } from "./wikiTemplates";
import type { CollectionSource } from "./source";

describe("wikiTemplates repository", () => {
  it("opens wikiTemplates on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = wikiTemplatesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("wikiTemplates");
    expect(handle).toEqual({ name: "wikiTemplates" });
  });
});
