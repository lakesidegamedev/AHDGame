import { describe, expect, it, vi } from "vitest";
import { russianCouncilFormationProposalsCollection } from "./russianCouncilFormationProposals";
import type { CollectionSource } from "./source";

describe("russianCouncilFormationProposals repository", () => {
  it("opens russianCouncilFormationProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianCouncilFormationProposalsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianCouncilFormationProposals");
    expect(handle).toEqual({ name: "russianCouncilFormationProposals" });
  });
});
