import { describe, expect, it, vi } from "vitest";
import { emailChangesCollection } from "./emailChanges";
import type { CollectionSource } from "./source";

describe("emailChanges repository", () => {
  it("opens emailChanges on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = emailChangesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("emailChanges");
    expect(handle).toEqual({ name: "emailChanges" });
  });
});
