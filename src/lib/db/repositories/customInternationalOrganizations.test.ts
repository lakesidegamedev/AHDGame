import { describe, expect, it, vi } from "vitest";
import { customInternationalOrganizationsCollection } from "./customInternationalOrganizations";
import type { CollectionSource } from "./source";

describe("customInternationalOrganizations repository", () => {
  it("opens customInternationalOrganizations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = customInternationalOrganizationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("customInternationalOrganizations");
    expect(handle).toEqual({ name: "customInternationalOrganizations" });
  });
});
