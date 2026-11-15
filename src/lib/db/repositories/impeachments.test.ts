import { describe, expect, it, vi } from "vitest";
import { impeachmentsCollection } from "./impeachments";
import type { CollectionSource } from "./source";

describe("impeachments repository", () => {
  it("opens impeachments on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = impeachmentsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("impeachments");
    expect(handle).toEqual({ name: "impeachments" });
  });
});
