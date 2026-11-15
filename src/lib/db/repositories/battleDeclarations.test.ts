import { describe, expect, it, vi } from "vitest";
import { battleDeclarationsCollection } from "./battleDeclarations";
import type { CollectionSource } from "./source";

describe("battleDeclarations repository", () => {
  it("opens battleDeclarations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = battleDeclarationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("battleDeclarations");
    expect(handle).toEqual({ name: "battleDeclarations" });
  });
});
