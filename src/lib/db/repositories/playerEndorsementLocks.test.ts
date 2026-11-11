import { describe, expect, it, vi } from "vitest";
import { playerEndorsementLocksCollection } from "./playerEndorsementLocks";
import type { CollectionSource } from "./source";

describe("playerEndorsementLocks repository", () => {
  it("opens playerEndorsementLocks on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = playerEndorsementLocksCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("playerEndorsementLocks");
    expect(handle).toEqual({ name: "playerEndorsementLocks" });
  });
});
