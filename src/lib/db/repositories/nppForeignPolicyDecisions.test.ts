import { describe, expect, it, vi } from "vitest";
import { nppForeignPolicyDecisionsCollection } from "./nppForeignPolicyDecisions";
import type { CollectionSource } from "./source";

describe("nppForeignPolicyDecisions repository", () => {
  it("opens nppForeignPolicyDecisions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nppForeignPolicyDecisionsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nppForeignPolicyDecisions");
    expect(handle).toEqual({ name: "nppForeignPolicyDecisions" });
  });
});
