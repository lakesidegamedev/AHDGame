import { describe, expect, it, vi } from "vitest";
import { russianPresidentialElectionResultsCollection } from "./russianPresidentialElectionResults";
import type { CollectionSource } from "./source";

describe("russianPresidentialElectionResults repository", () => {
  it("opens russianPresidentialElectionResults on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianPresidentialElectionResultsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianPresidentialElectionResults");
    expect(handle).toEqual({ name: "russianPresidentialElectionResults" });
  });
});
