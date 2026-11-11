import { describe, expect, it, vi } from "vitest";
import { altLinksCollection } from "./altLinks";
import type { CollectionSource } from "./source";

describe("altLinks repository", () => {
  it("opens altLinks on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = altLinksCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("altLinks");
    expect(handle).toEqual({ name: "altLinks" });
  });
});
