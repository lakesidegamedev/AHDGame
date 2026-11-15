import { describe, expect, it, vi } from "vitest";
import { ukGovernmentCollection } from "./ukGovernment";
import type { CollectionSource } from "./source";

describe("ukGovernment repository", () => {
  it("opens ukGovernment on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukGovernmentCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukGovernment");
    expect(handle).toEqual({ name: "ukGovernment" });
  });
});
