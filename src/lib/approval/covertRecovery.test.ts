import { describe, it, expect, vi, afterEach } from "vitest";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
vi.mock("@/lib/db/sessionDb", async () =>
  (await import("@/lib/test-utils/atomicDomainMock")).atomicDomainMock()
);
vi.mock("@/lib/coldwar/tension", () => ({ applyTensionEvent: vi.fn() }));
vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn() }));
import { applyCovertNuclearTurn } from "@/lib/turn/covertNuclearTurn";
import { createSystemNewsPost } from "@/lib/news";

describe("Covert discovery atomic approval", () => {
  afterEach(() => vi.restoreAllMocks());
  it("rolls back funding and discovery with a failed approval write, then applies once", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const db = createInMemoryDb();
    db.seed("covertNuclearPrograms", [
      {
        _id: "DD",
        funding: "crash",
        suspicion: 60,
        stage: 3,
        progress: 30,
        exposureCount: 0,
        completed: false,
      },
    ]);
    db.seed("federalBudget", [
      {
        _id: "DD",
        countryId: "DD",
        defenseAppropriation: {
          balance: 10000,
          encumbered: 0,
          accruedThroughTurn: 0,
          arrearsRatio: 0,
        },
      },
    ]);
    const approval = db.seed("governmentApprovals", [
      { _id: "DD", approvalRating: 50, approvalRawRating: 50, approvalAdjustment: 0 },
    ]);
    const write = approval.updateOne.bind(approval);
    let interrupt = true;
    approval.updateOne = async (...args: Parameters<typeof write>) => {
      const result = await write(...args);
      if (interrupt && Array.isArray(args[1])) {
        interrupt = false;
        throw new Error("approval interruption");
      }
      return result;
    };
    await expect(applyCovertNuclearTurn(db as never, "DD", 42)).rejects.toThrow(
      "approval interruption"
    );
    expect(db.collection("federalBudget").docs[0].defenseAppropriation).toMatchObject({
      balance: 10000,
    });
    expect(db.collection("covertNuclearPrograms").docs[0]).toMatchObject({
      stage: 3,
      funding: "crash",
    });
    expect(approval.docs[0].approvalRating).toBe(50);
    expect(createSystemNewsPost).not.toHaveBeenCalled();
    const first = await applyCovertNuclearTurn(db as never, "DD", 42);
    expect(first.discovered).toBe(true);
    const cashAfter = db.collection("federalBudget").docs[0].defenseAppropriation;
    expect(approval.docs[0].approvalRating).toBe(47);
    const repeated = await applyCovertNuclearTurn(db as never, "DD", 42);
    expect(repeated).toMatchObject({ spent: 0, discovered: false });
    expect(db.collection("federalBudget").docs[0].defenseAppropriation).toEqual(cashAfter);
    expect(approval.docs[0].approvalRating).toBe(47);
    expect(createSystemNewsPost).toHaveBeenCalledTimes(1);
  });
});
