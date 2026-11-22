import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const applyLegislationEffect = vi.fn();
const onBillEnacted = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/legislationEffects", () => ({ applyLegislationEffect }));
vi.mock("@/lib/billEnactment", () => ({ onBillEnacted }));

const { applyEnactedBillEffects } = await import("./applyEnactedBillEffects");

describe("applyEnactedBillEffects", () => {
  const db = {} as never;
  const bill = {
    _id: new ObjectId(),
    title: "Test Act",
    countryId: "US",
    stateId: "federal",
    provisions: [],
  } as never;

  beforeEach(() => {
    vi.clearAllMocks();
    onBillEnacted.mockResolvedValue(undefined);
  });

  it("reuses the legislation-type catalog loaded by legacy effects", async () => {
    const legislationTypes = new Map([["policy", { _id: "policy" }]]);
    applyLegislationEffect.mockResolvedValue(legislationTypes);

    await applyEnactedBillEffects(db, bill, 12, { effect: "effect", enactment: "enactment" });

    expect(onBillEnacted).toHaveBeenCalledWith(db, bill, 12, legislationTypes);
  });

  it("rejects a failed first layer so enactment rolls back", async () => {
    applyLegislationEffect.mockRejectedValue(new Error("effect failed"));
    await expect(
      applyEnactedBillEffects(db, bill, 12, { effect: "effect", enactment: "enactment" })
    ).rejects.toThrow("effect failed");
    expect(onBillEnacted).not.toHaveBeenCalled();
  });

  it("rejects a failed enactment hook so the first layer rolls back too", async () => {
    applyLegislationEffect.mockResolvedValue(new Map());
    onBillEnacted.mockRejectedValue(new Error("enactment failed"));
    await expect(
      applyEnactedBillEffects(db, bill, 12, { effect: "effect", enactment: "enactment" })
    ).rejects.toThrow("enactment failed");
  });
});
