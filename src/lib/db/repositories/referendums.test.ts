import { describe, expect, it, vi } from "vitest";
import { referendumsCollection } from "./referendums";
import type { CollectionSource } from "./source";

describe("referendums repository", () => {
  it("opens referendums on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = referendumsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("referendums");
    expect(handle).toEqual({ name: "referendums" });
  });
});
