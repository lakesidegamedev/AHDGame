import { describe, expect, it, vi } from "vitest";
import { organizationLegislationCollection } from "./organizationLegislation";
import type { CollectionSource } from "./source";

describe("organizationLegislation repository", () => {
  it("opens organizationLegislation on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = organizationLegislationCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("organizationLegislation");
    expect(handle).toEqual({ name: "organizationLegislation" });
  });
});
