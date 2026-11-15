import { describe, expect, it, vi } from "vitest";
import { russianDumaLawProposalsCollection } from "./russianDumaLawProposals";
import type { CollectionSource } from "./source";

describe("russianDumaLawProposals repository", () => {
  it("opens russianDumaLawProposals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianDumaLawProposalsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianDumaLawProposals");
    expect(handle).toEqual({ name: "russianDumaLawProposals" });
  });
});
