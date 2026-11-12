import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { isLiveWorldSwitchOn } from "./liveWorldSwitches";

function dbWith(findOne: ReturnType<typeof vi.fn>): Db {
  return { collection: () => ({ findOne }) } as unknown as Db;
}

describe("isLiveWorldSwitchOn", () => {
  it("is on only when the world's config sets the switch to true", async () => {
    const findOne = vi.fn().mockResolvedValue({ leaderLegacyEnabled: true });
    expect(await isLiveWorldSwitchOn(dbWith(findOne), "leaderLegacyEnabled")).toBe(true);
    expect(findOne).toHaveBeenCalledWith(
      { _id: "default" },
      { projection: { leaderLegacyEnabled: 1 } }
    );
  });

  it("is off when the field is absent, as on a world seeded before the system", async () => {
    const findOne = vi.fn().mockResolvedValue({});
    expect(await isLiveWorldSwitchOn(dbWith(findOne), "crisisV2StagesEnabled")).toBe(false);
    expect(
      await isLiveWorldSwitchOn(dbWith(vi.fn().mockResolvedValue(null)), "crisisV2StagesEnabled")
    ).toBe(false);
  });

  it("is off when the config cannot be read", async () => {
    const findOne = vi.fn().mockRejectedValue(new Error("down"));
    expect(await isLiveWorldSwitchOn(dbWith(findOne), "executiveSuccessionEnabled")).toBe(false);
  });
});
