import { describe, expect, it, vi } from "vitest";
import { governmentFormationsCollection } from "./governmentFormations";
import type { CollectionSource } from "./source";

describe("governmentFormations repository", () => {
  it("opens governmentFormations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governmentFormationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governmentFormations");
    expect(handle).toEqual({ name: "governmentFormations" });
  });
});
