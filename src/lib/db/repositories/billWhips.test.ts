import { describe, expect, it, vi } from "vitest";
import { billWhipsCollection } from "./billWhips";
import type { CollectionSource } from "./source";

describe("billWhips repository", () => {
  it("opens billWhips on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = billWhipsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("billWhips");
    expect(handle).toEqual({ name: "billWhips" });
  });
});
