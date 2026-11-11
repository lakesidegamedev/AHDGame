import { describe, expect, it, vi } from "vitest";
import { politicalPartiesCollection } from "./politicalParties";
import type { CollectionSource } from "./source";

describe("politicalParties repository", () => {
  it("opens politicalParties on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = politicalPartiesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("politicalParties");
    expect(handle).toEqual({ name: "politicalParties" });
  });
});
