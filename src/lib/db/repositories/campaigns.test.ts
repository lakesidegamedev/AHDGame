import { describe, expect, it, vi } from "vitest";
import { campaignsCollection } from "./campaigns";
import type { CollectionSource } from "./source";

describe("campaigns repository", () => {
  it("opens campaigns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = campaignsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("campaigns");
    expect(handle).toEqual({ name: "campaigns" });
  });
});
