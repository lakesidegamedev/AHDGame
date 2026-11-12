import { describe, expect, it, vi } from "vitest";
import { clientSimulationStatisticsCollection } from "./clientSimulationStatistics";
import type { CollectionSource } from "./source";

describe("clientSimulationStatistics repository", () => {
  it("opens clientSimulationStatistics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = clientSimulationStatisticsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("clientSimulationStatistics");
    expect(handle).toEqual({ name: "clientSimulationStatistics" });
  });
});
