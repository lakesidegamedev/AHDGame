import { describe, expect, it, vi } from "vitest";
import { ukPartyConferencesCollection } from "./ukPartyConferences";
import type { CollectionSource } from "./source";

describe("ukPartyConferences repository", () => {
  it("opens ukPartyConferences on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukPartyConferencesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukPartyConferences");
    expect(handle).toEqual({ name: "ukPartyConferences" });
  });
});
