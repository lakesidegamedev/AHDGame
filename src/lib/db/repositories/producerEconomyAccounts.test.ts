import { describe, expect, it, vi } from "vitest";
import { producerEconomyAccountsCollection } from "./producerEconomyAccounts";
import type { CollectionSource } from "./source";

describe("producerEconomyAccounts repository", () => {
  it("opens producerEconomyAccounts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = producerEconomyAccountsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("producerEconomyAccounts");
    expect(handle).toEqual({ name: "producerEconomyAccounts" });
  });
});
