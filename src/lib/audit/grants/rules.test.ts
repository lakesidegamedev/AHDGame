import { describe, expect, it } from "vitest";
import {
  buildGrantMeta,
  grantAction,
  grantProblems,
  resourceGrantInputs,
  type GrantInput,
} from "./rules";

const ID = "a".repeat(24);
const base: GrantInput = {
  actorUserId: ID,
  actorRole: "admin",
  recipients: [{ type: "character", id: "b".repeat(24) }],
  kind: "funds",
  amount: 1000,
  reason: "compensation for a bug",
};

describe("grantProblems", () => {
  it("accepts an admin grant", () => {
    expect(grantProblems(base)).toEqual([]);
  });

  it("refuses a grant with no accountable human", () => {
    expect(grantProblems({ ...base, actorUserId: "ops-agent" })).toContain(
      "the acting user must be a user id"
    );
    expect(grantProblems({ ...base, actorRole: null })).toContain(
      "the acting user must hold a staff role"
    );
  });

  it("needs a user id, not free text, for who asked", () => {
    const via = { tool: "heal-ops", requestedBy: "User-authorized correction" };
    expect(grantProblems({ ...base, via })).toContain(
      "requestedBy must be the id of the person who asked, never free text"
    );
    expect(grantProblems({ ...base, via: { tool: "heal-ops", requestedBy: ID } })).toEqual([]);
    expect(grantProblems({ ...base, via: { tool: " ", requestedBy: ID } })).toContain(
      "a script or agent must name its tool"
    );
  });

  it("needs recipients, a reason and an amount or item", () => {
    const problems = grantProblems({
      ...base,
      recipients: [],
      reason: "",
      amount: undefined,
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        "at least one recipient is required",
        "a reason is required",
        "give an amount or name the item",
      ])
    );
  });

  it("allows an item without an amount, and all players without an id", () => {
    expect(
      grantProblems({
        ...base,
        kind: "voucher",
        amount: undefined,
        item: "Positions Update Voucher",
        recipients: [{ type: "all_players" }],
      })
    ).toEqual([]);
  });
});

describe("buildGrantMeta", () => {
  it("caps stored recipients but keeps the true count", () => {
    const recipients = Array.from({ length: 500 }, (_, i) => ({
      type: "character" as const,
      id: String(i),
    }));
    const meta = buildGrantMeta({ ...base, recipients });
    expect(meta.recipients).toHaveLength(200);
    expect(meta.recipientCount).toBe(500);
  });

  it("names the action by kind", () => {
    expect(grantAction("cash")).toBe("grant.cash");
  });
});

describe("resourceGrantInputs", () => {
  it("makes one grant per resource and falls back to the generated reason", () => {
    const ids = ["b".repeat(24), "c".repeat(24)];
    const grants = resourceGrantInputs(
      { characterIds: ids, actions: 5, funds: 1000, cashOnHand: 2000, currency: "EUR" },
      ID,
      "Control panel grant"
    );
    expect(grants.map((g) => g.kind)).toEqual(["actions", "funds", "cash"]);
    expect(grants[2]).toMatchObject({ amount: 2000, currencyCode: "EUR" });
    expect(grants[0]!.recipients).toHaveLength(2);
    expect(grants.every((g) => g.reason === "Control panel grant")).toBe(true);
  });

  it("targets everyone for an all players grant and keeps a typed reason", () => {
    const [grant] = resourceGrantInputs(
      { allPlayers: true, positionUpdateVoucher: true, reason: " fixes the era change " },
      ID,
      "fallback"
    );
    expect(grant).toMatchObject({
      kind: "voucher",
      recipients: [{ type: "all_players" }],
      reason: "fixes the era change",
    });
  });
});
