import { describe, expect, it, vi } from "vitest";
import { bankLoansCollection } from "./bankLoans";
import type { CollectionSource } from "./source";

describe("bankLoans repository", () => {
  it("opens bankLoans on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bankLoansCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bankLoans");
    expect(handle).toEqual({ name: "bankLoans" });
  });
});
