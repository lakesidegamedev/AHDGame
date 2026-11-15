import { describe, expect, it, vi } from "vitest";
import { russianCouncilElectionResultsCollection } from "./russianCouncilElectionResults";
import type { CollectionSource } from "./source";

describe("russianCouncilElectionResults repository", () => {
  it("opens russianCouncilElectionResults on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianCouncilElectionResultsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianCouncilElectionResults");
    expect(handle).toEqual({ name: "russianCouncilElectionResults" });
  });
});
