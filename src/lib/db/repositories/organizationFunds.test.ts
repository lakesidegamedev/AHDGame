import { describe, expect, it, vi } from "vitest";
import { organizationFundsCollection } from "./organizationFunds";
import type { CollectionSource } from "./source";

describe("organizationFunds repository", () => {
  it("opens organizationFunds on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = organizationFundsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("organizationFunds");
    expect(handle).toEqual({ name: "organizationFunds" });
  });
});
