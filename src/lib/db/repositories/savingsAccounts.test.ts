import { describe, expect, it, vi } from "vitest";
import { savingsAccountsCollection } from "./savingsAccounts";
import type { CollectionSource } from "./source";

describe("savingsAccounts repository", () => {
  it("opens savingsAccounts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = savingsAccountsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("savingsAccounts");
    expect(handle).toEqual({ name: "savingsAccounts" });
  });
});
