import { describe, expect, it, vi } from "vitest";
import { casinoRoundsCollection } from "./casinoRounds";
import type { CollectionSource } from "./source";

describe("casinoRounds repository", () => {
  it("opens casinoRounds on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = casinoRoundsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("casinoRounds");
    expect(handle).toEqual({ name: "casinoRounds" });
  });
});
