import { describe, expect, it, vi } from "vitest";
import { federationFiscalAccountsCollection } from "./federationFiscalAccounts";
import type { CollectionSource } from "./source";

describe("federationFiscalAccounts repository", () => {
  it("opens federationFiscalAccounts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationFiscalAccountsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationFiscalAccounts");
    expect(handle).toEqual({ name: "federationFiscalAccounts" });
  });
});
