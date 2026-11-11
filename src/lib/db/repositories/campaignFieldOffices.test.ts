import { describe, expect, it, vi } from "vitest";
import { campaignFieldOfficesCollection } from "./campaignFieldOffices";
import type { CollectionSource } from "./source";

describe("campaignFieldOffices repository", () => {
  it("opens campaignFieldOffices on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = campaignFieldOfficesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("campaignFieldOffices");
    expect(handle).toEqual({ name: "campaignFieldOffices" });
  });
});
