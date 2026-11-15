import { describe, expect, it, vi } from "vitest";
import { playerEndorsementsCollection } from "./playerEndorsements";
import type { CollectionSource } from "./source";

describe("playerEndorsements repository", () => {
  it("opens playerEndorsements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = playerEndorsementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("playerEndorsements");
    expect(handle).toEqual({ name: "playerEndorsements" });
  });
});
