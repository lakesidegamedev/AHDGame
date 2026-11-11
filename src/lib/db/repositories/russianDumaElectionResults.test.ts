import { describe, expect, it, vi } from "vitest";
import { russianDumaElectionResultsCollection } from "./russianDumaElectionResults";
import type { CollectionSource } from "./source";

describe("russianDumaElectionResults repository", () => {
  it("opens russianDumaElectionResults on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianDumaElectionResultsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianDumaElectionResults");
    expect(handle).toEqual({ name: "russianDumaElectionResults" });
  });
});
