import { describe, expect, it, vi } from "vitest";
import { federationSettlementApplicationsCollection } from "./federationSettlementApplications";
import type { CollectionSource } from "./source";

describe("federationSettlementApplications repository", () => {
  it("opens federationSettlementApplications on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationSettlementApplicationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationSettlementApplications");
    expect(handle).toEqual({ name: "federationSettlementApplications" });
  });
});
