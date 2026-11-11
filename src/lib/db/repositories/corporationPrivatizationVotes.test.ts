import { describe, expect, it, vi } from "vitest";
import { corporationPrivatizationVotesCollection } from "./corporationPrivatizationVotes";
import type { CollectionSource } from "./source";

describe("corporationPrivatizationVotes repository", () => {
  it("opens corporationPrivatizationVotes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = corporationPrivatizationVotesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("corporationPrivatizationVotes");
    expect(handle).toEqual({ name: "corporationPrivatizationVotes" });
  });
});
