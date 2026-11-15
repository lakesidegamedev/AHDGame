import { describe, expect, it, vi } from "vitest";
import { crisesCollection } from "./crises";
import type { CollectionSource } from "./source";

describe("crises repository", () => {
  it("opens crises on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = crisesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("crises");
    expect(handle).toEqual({ name: "crises" });
  });
});
