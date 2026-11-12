import { describe, expect, it, vi } from "vitest";
import { primaryStateActionsCollection } from "./primaryStateActions";
import type { CollectionSource } from "./source";

describe("primaryStateActions repository", () => {
  it("opens primaryStateActions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = primaryStateActionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("primaryStateActions");
    expect(handle).toEqual({ name: "primaryStateActions" });
  });
});
