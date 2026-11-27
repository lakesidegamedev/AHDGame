import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { countRoundTrips } from "@/lib/test-utils/roundTripCounter";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { processGovernorExecutiveOrders } from "./governorOrders";
import { rescindOrder } from "@/lib/governorOffice/orders/rescindOrder";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
function fixture(count = 1, legacySnapshot = false) {
  const f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 80 }]);
  const actor = new ObjectId();
  const orders = Array.from({ length: count }, (_, i) => ({
    _id: new ObjectId(),
    countryId: "US",
    stateId: `R${i}`,
    legislationTypeId: "law",
    status: "active",
    expiresAtTurn: 74,
    issuedAtTurn: 50,
    issuedByCharacterId: actor,
    policyOptionIndexBefore: 3,
    policyOptionIndexAfter: 4,
    ...(legacySnapshot ? {} : { policyOptionIdBefore: "l4", economicBefore: 0, socialBefore: 0 }),
  }));
  f.memory.seed("governorExecutiveOrders", orders);
  f.memory.seed(
    "statePolicies",
    orders.map((order) => ({
      _id: new ObjectId(),
      countryId: "US",
      stateId: order.stateId,
      legislationTypeId: "law",
      policyOptionId: "l4",
      policyOptionIndex: 4,
      enactedBy: { kind: "order", id: order._id },
    }))
  );
  f.memory.seed("legislationTypes", [
    {
      _id: "law",
      policyOptions: Array.from({ length: 5 }, (_, i) => ({
        id: `l${i}`,
        name: `Level ${i}`,
        economic: i === 3 ? -2.5 : 0,
        social: i === 3 ? 1 : 0,
        effectDirection: i < 2 ? -1 : i > 2 ? 1 : 0,
      })),
    },
  ]);
  return { ...f, orders, actor };
}
describe("executive order restoration", () => {
  it.each([false, true])(
    "restores the prior ladder option from incomplete or mismatched snapshots, legacy=%s",
    async (legacy) => {
      const f = fixture(1, legacy);
      expect(await processGovernorExecutiveOrders(f.db, 80)).toEqual({ expired: 1, superseded: 0 });
      expect(f.memory.collection("statePolicies").docs[0]).toMatchObject({
        policyOptionId: "l3",
        policyOptionIndex: 3,
        economic: -2.5,
        social: 1,
        effectDirection: 1,
      });
      expect(await processGovernorExecutiveOrders(f.db, 80)).toEqual({ expired: 0, superseded: 0 });
    }
  );
  it.each(["statePolicies", "governorExecutiveOrders"])(
    "rolls back an interrupted %s batch and completes once on retry",
    async (collection) => {
      const f = fixture(3);
      const fault = withInjectedCrash(f.memory, {
        collection,
        op: "bulkWrite",
        onCall: 1,
        afterWrite: true,
      });
      Object.assign(fault.db, { client: f.db.client });
      await expect(processGovernorExecutiveOrders(fault.db, 80)).rejects.toThrow();
      expect(
        f.memory.collection("governorExecutiveOrders").docs.every((row) => row.status === "active")
      ).toBe(true);
      expect(
        f.memory.collection("statePolicies").docs.every((row) => row.policyOptionIndex === 4)
      ).toBe(true);
      const results = await Promise.all([
        processGovernorExecutiveOrders(f.db, 80),
        processGovernorExecutiveOrders(f.db, 80),
      ]);
      expect(results.reduce((sum, row) => sum + row.expired, 0)).toBe(3);
    }
  );
  it("does not restore over a superseding bill or a foreign region's policy", async () => {
    const f = fixture();
    const billId = new ObjectId();
    await f.memory
      .collection("statePolicies")
      .updateOne(
        { stateId: "R0" },
        { $set: { enactedBy: { kind: "bill", id: billId }, policyOptionIndex: 2 } }
      );
    await f.memory.collection("statePolicies").insertOne({
      _id: new ObjectId(),
      countryId: "CA",
      stateId: "R0",
      legislationTypeId: "law",
      policyOptionIndex: 1,
    });
    expect(await processGovernorExecutiveOrders(f.db, 80)).toEqual({ expired: 0, superseded: 1 });
    expect(f.memory.collection("statePolicies").docs.map((row) => row.policyOptionIndex)).toEqual([
      2, 1,
    ]);
  });
  it("batches expiry reads and writes independently of the active-order count", async () => {
    const f = fixture(100);
    const counter = countRoundTrips(f.memory);
    expect((await processGovernorExecutiveOrders(f.db, 80)).expired).toBe(100);
    expect(counter.total()).toBe(5);
  });
  it("scopes manual rescission to the authorized country and region", async () => {
    const f = fixture();
    expect(
      (
        await rescindOrder(f.db, {
          orderId: f.orders[0]._id,
          rescindedByCharacterId: f.actor,
          countryId: "CA",
          stateId: "R0",
        })
      ).status
    ).toBe(404);
    expect(
      (
        await rescindOrder(f.db, {
          orderId: f.orders[0]._id,
          rescindedByCharacterId: f.actor,
          countryId: "US",
          stateId: "OTHER",
        })
      ).status
    ).toBe(404);
    expect(f.memory.collection("statePolicies").docs[0].policyOptionIndex).toBe(4);
  });
  it("couples a manual rescission to its policy restoration", async () => {
    const f = fixture();
    const fault = withInjectedCrash(f.memory, {
      collection: "governorExecutiveOrders",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: f.db.client });
    const input = {
      orderId: f.orders[0]._id,
      rescindedByCharacterId: f.actor,
      countryId: "US" as const,
      stateId: "R0",
    };
    await expect(rescindOrder(fault.db, input)).rejects.toThrow();
    expect(f.memory.collection("statePolicies").docs[0].policyOptionIndex).toBe(4);
    expect((await rescindOrder(f.db, input)).status).toBe(200);
    expect(f.memory.collection("governorExecutiveOrders").docs[0].status).toBe("rescinded");
  });
});
