import { describe, expect, it, vi } from "vitest";
import { partyStrengthPressureCollection } from "./partyStrengthPressure";
import type { CollectionSource } from "./source";

describe("partyStrengthPressure repository", () => {
  it("opens partyStrengthPressure on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = partyStrengthPressureCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("partyStrengthPressure");
    expect(handle).toEqual({ name: "partyStrengthPressure" });
  });
});
