import { describe, expect, it, vi } from "vitest";
import { playerIncomeTaxAssessmentsCollection } from "./playerIncomeTaxAssessments";
import type { CollectionSource } from "./source";

describe("playerIncomeTaxAssessments repository", () => {
  it("opens playerIncomeTaxAssessments on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = playerIncomeTaxAssessmentsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("playerIncomeTaxAssessments");
    expect(handle).toEqual({ name: "playerIncomeTaxAssessments" });
  });
});
