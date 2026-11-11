import { describe, expect, it, vi } from "vitest";
import { resetDepartmentContinuityCollection } from "./resetDepartmentContinuity";
import type { CollectionSource } from "./source";

describe("resetDepartmentContinuity repository", () => {
  it("opens resetDepartmentContinuity on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = resetDepartmentContinuityCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("resetDepartmentContinuity");
    expect(handle).toEqual({ name: "resetDepartmentContinuity" });
  });
});
