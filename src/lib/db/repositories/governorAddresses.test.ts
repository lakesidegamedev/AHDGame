import { describe, expect, it, vi } from "vitest";
import { governorAddressesCollection } from "./governorAddresses";
import type { CollectionSource } from "./source";

describe("governorAddresses repository", () => {
  it("opens governorAddresses on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governorAddressesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governorAddresses");
    expect(handle).toEqual({ name: "governorAddresses" });
  });
});
