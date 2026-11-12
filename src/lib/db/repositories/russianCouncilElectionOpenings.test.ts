import { describe, expect, it, vi } from "vitest";
import { russianCouncilElectionOpeningsCollection } from "./russianCouncilElectionOpenings";
import type { CollectionSource } from "./source";

describe("russianCouncilElectionOpenings repository", () => {
  it("opens russianCouncilElectionOpenings on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianCouncilElectionOpeningsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianCouncilElectionOpenings");
    expect(handle).toEqual({ name: "russianCouncilElectionOpenings" });
  });
});
