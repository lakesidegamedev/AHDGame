import { describe, expect, it, vi } from "vitest";
import { scotusNominationsCollection } from "./scotusNominations";
import type { CollectionSource } from "./source";

describe("scotusNominations repository", () => {
  it("opens scotusNominations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = scotusNominationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("scotusNominations");
    expect(handle).toEqual({ name: "scotusNominations" });
  });
});
