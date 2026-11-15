import { describe, expect, it, vi } from "vitest";
import { governorOfficeStateCollection } from "./governorOfficeState";
import type { CollectionSource } from "./source";

describe("governorOfficeState repository", () => {
  it("opens governorOfficeState on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governorOfficeStateCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governorOfficeState");
    expect(handle).toEqual({ name: "governorOfficeState" });
  });
});
