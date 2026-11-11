import { describe, expect, it, vi } from "vitest";
import { partyHistoryCollection } from "./partyHistory";
import type { CollectionSource } from "./source";

describe("partyHistory repository", () => {
  it("opens partyHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyHistory");
    expect(handle).toEqual({ name: "partyHistory" });
  });
});
