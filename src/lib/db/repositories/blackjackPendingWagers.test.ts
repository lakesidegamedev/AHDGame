import { describe, expect, it, vi } from "vitest";
import { blackjackPendingWagersCollection } from "./blackjackPendingWagers";
import type { CollectionSource } from "./source";

describe("blackjackPendingWagers repository", () => {
  it("opens blackjackPendingWagers on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = blackjackPendingWagersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("blackjackPendingWagers");
    expect(handle).toEqual({ name: "blackjackPendingWagers" });
  });
});
