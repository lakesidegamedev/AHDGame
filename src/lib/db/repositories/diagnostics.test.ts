import { describe, expect, it, vi } from "vitest";
import { diagnosticsCollection } from "./diagnostics";
import type { CollectionSource } from "./source";

describe("diagnostics repository", () => {
  it("opens diagnostics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = diagnosticsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("diagnostics");
    expect(handle).toEqual({ name: "diagnostics" });
  });
});
