import { describe, expect, it, vi } from "vitest";
import { congressLeadersCollection } from "./congressLeaders";
import type { CollectionSource } from "./source";

describe("congressLeaders repository", () => {
  it("opens congressLeaders on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = congressLeadersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("congressLeaders");
    expect(handle).toEqual({ name: "congressLeaders" });
  });
});
