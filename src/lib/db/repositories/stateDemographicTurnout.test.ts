import { describe, expect, it, vi } from "vitest";
import { stateDemographicTurnoutCollection } from "./stateDemographicTurnout";
import type { CollectionSource } from "./source";

describe("stateDemographicTurnout repository", () => {
  it("opens stateDemographicTurnout on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateDemographicTurnoutCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateDemographicTurnout");
    expect(handle).toEqual({ name: "stateDemographicTurnout" });
  });
});
