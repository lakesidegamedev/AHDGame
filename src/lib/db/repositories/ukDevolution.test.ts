import { describe, expect, it, vi } from "vitest";
import { ukDevolutionCollection } from "./ukDevolution";
import type { CollectionSource } from "./source";

describe("ukDevolution repository", () => {
  it("opens ukDevolution on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ukDevolutionCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ukDevolution");
    expect(handle).toEqual({ name: "ukDevolution" });
  });
});
