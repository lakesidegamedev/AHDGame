import { describe, expect, it, vi } from "vitest";
import { partyPoliticalStrengthLedgerCollection } from "./partyPoliticalStrengthLedger";
import type { CollectionSource } from "./source";

describe("partyPoliticalStrengthLedger repository", () => {
  it("opens partyPoliticalStrengthLedger on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyPoliticalStrengthLedgerCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyPoliticalStrengthLedger");
    expect(handle).toEqual({ name: "partyPoliticalStrengthLedger" });
  });
});
