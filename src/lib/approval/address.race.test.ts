vi.mock("@/lib/db/sessionDb", async () =>
  (await import("@/lib/test-utils/atomicDomainMock")).atomicDomainMock()
);
import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
vi.mock("@/lib/news", () => ({ generateAddressNews: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/discordWebhooks", () => ({
  sendCountryGameEvent: vi.fn().mockResolvedValue(undefined),
}));
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { deliverAddress } from "@/lib/governorOffice/address/deliverAddress";
import { getActiveAddressApprovalModifiers } from "@/lib/governorOffice/address/activeAddressModifiers";

describe("Address approval cooldown", () => {
  it("admits one simultaneous delivery per office", async () => {
    const db = createInMemoryDb();
    const id = new ObjectId();
    db.seed("gameState", [{ _id: "current", currentTurn: 20 }]);
    db.seed("governorOfficeState", [
      { _id: new ObjectId(), countryId: "US", stateId: "TX", gubernatorialActions: 1000 },
    ]);
    db.seed("characters", [{ _id: id, nationalInfluence: 1000 }]);
    const input = {
      countryId: "US" as const,
      stateId: "TX",
      character: { _id: id, name: "Audit" },
      title: "A local test address",
      emphasizedCategories: ["economic", "healthcare"],
    };
    const result = await Promise.all([
      deliverAddress(db as never, input),
      deliverAddress(db as never, input),
    ]);
    const mods = await getActiveAddressApprovalModifiers(db as never, "US", "TX", 20);
    const actual = {
      statuses: result.map((x) => x.status),
      addressCount: db.collection("governorAddresses").docs.length,
      approvalEffects: mods.map((x) => x.effect),
      sum: mods.reduce((s, m) => s + m.effect, 0),
    };

    expect(actual.statuses.sort()).toEqual([200, 400]);
    expect(actual.addressCount).toBe(1);
    expect(actual.sum).toBe(3);
  });
});
