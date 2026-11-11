import { describe, expect, it, vi } from "vitest";
import { unionOrganizersCollection } from "./unionOrganizers";
import type { CollectionSource } from "./source";

describe("unionOrganizers repository", () => {
  it("opens unionOrganizers on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = unionOrganizersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("unionOrganizers");
    expect(handle).toEqual({ name: "unionOrganizers" });
  });
});
