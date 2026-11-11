import { describe, expect, it, vi } from "vitest";
import { indexFundsCollection } from "./indexFunds";
import type { CollectionSource } from "./source";

describe("indexFunds repository", () => {
  it("opens indexFunds on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = indexFundsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("indexFunds");
    expect(handle).toEqual({ name: "indexFunds" });
  });
});
