import { describe, expect, it, vi } from "vitest";
import { bankingLawsCollection } from "./bankingLaws";
import type { CollectionSource } from "./source";

describe("bankingLaws repository", () => {
  it("opens bankingLaws on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bankingLawsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bankingLaws");
    expect(handle).toEqual({ name: "bankingLaws" });
  });
});
