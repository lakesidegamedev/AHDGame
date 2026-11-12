import { describe, expect, it, vi } from "vitest";
import { bargainingCampaignsCollection } from "./bargainingCampaigns";
import type { CollectionSource } from "./source";

describe("bargainingCampaigns repository", () => {
  it("opens bargainingCampaigns on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bargainingCampaignsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bargainingCampaigns");
    expect(handle).toEqual({ name: "bargainingCampaigns" });
  });
});
