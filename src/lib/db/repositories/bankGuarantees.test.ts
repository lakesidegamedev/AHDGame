import { describe, expect, it, vi } from "vitest";
import { bankGuaranteesCollection } from "./bankGuarantees";
import type { CollectionSource } from "./source";

describe("bankGuarantees repository", () => {
  it("opens bankGuarantees on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bankGuaranteesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bankGuarantees");
    expect(handle).toEqual({ name: "bankGuarantees" });
  });
});
