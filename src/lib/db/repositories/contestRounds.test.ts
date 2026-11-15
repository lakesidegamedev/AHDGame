import { describe, expect, it, vi } from "vitest";
import { contestRoundsCollection } from "./contestRounds";
import type { CollectionSource } from "./source";

describe("contestRounds repository", () => {
  it("opens contestRounds on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = contestRoundsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("contestRounds");
    expect(handle).toEqual({ name: "contestRounds" });
  });
});
