import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Db } from "mongodb";

const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
vi.mock("@/lib/db/collections/npps", () => ({
  getNppsCollection: vi.fn(async () => ({ updateOne })),
}));

import { payNppSqueezeOut } from "./payNppSqueezeOut";

describe("payNppSqueezeOut", () => {
  it("credits the NPP anchor balance with the rounded payout", async () => {
    const nppId = new ObjectId();
    const now = new Date();
    await payNppSqueezeOut({} as Db, nppId, 1234.6, now);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: nppId },
      { $inc: { "currencyBalances.personal.USD": 1235 }, $set: { updatedAt: now } }
    );
  });
});
