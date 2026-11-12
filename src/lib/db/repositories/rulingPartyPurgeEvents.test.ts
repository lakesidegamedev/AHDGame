import { describe, expect, it, vi } from "vitest";
import { rulingPartyPurgeEventsCollection } from "./rulingPartyPurgeEvents";
import type { CollectionSource } from "./source";

describe("rulingPartyPurgeEvents repository", () => {
  it("opens rulingPartyPurgeEvents on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = rulingPartyPurgeEventsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("rulingPartyPurgeEvents");
    expect(handle).toEqual({ name: "rulingPartyPurgeEvents" });
  });
});
