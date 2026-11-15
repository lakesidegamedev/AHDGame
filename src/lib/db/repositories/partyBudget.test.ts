import { describe, expect, it, vi } from "vitest";
import { partyBudgetCollection } from "./partyBudget";
import type { CollectionSource } from "./source";

describe("partyBudget repository", () => {
  it("opens partyBudget on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyBudgetCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyBudget");
    expect(handle).toEqual({ name: "partyBudget" });
  });
});
