import { describe, expect, it, vi } from "vitest";
import { healTokensCollection } from "./healTokens";
import type { CollectionSource } from "./source";

describe("healTokens repository", () => {
  it("opens healTokens on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = healTokensCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("healTokens");
    expect(handle).toEqual({ name: "healTokens" });
  });
});
