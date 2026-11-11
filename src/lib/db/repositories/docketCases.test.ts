import { describe, expect, it, vi } from "vitest";
import { docketCasesCollection } from "./docketCases";
import type { CollectionSource } from "./source";

describe("docketCases repository", () => {
  it("opens docketCases on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = docketCasesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("docketCases");
    expect(handle).toEqual({ name: "docketCases" });
  });
});
