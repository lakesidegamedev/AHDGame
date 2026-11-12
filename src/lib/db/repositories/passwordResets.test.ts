import { describe, expect, it, vi } from "vitest";
import { passwordResetsCollection } from "./passwordResets";
import type { CollectionSource } from "./source";

describe("passwordResets repository", () => {
  it("opens passwordResets on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = passwordResetsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("passwordResets");
    expect(handle).toEqual({ name: "passwordResets" });
  });
});
