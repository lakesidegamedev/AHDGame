import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockCollection, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/gameState", () => ({ getGameState: vi.fn() }));
vi.mock("@/lib/adminLog", () => ({ createAdminLog: vi.fn() }));
vi.mock("@/lib/settlement/attachToWar", () => ({
  describeQualifyingWar: vi.fn(),
  warFreezeNotice: vi.fn(),
}));
vi.mock("@/lib/settlement/openCrisis", () => ({ openSettlementCrisis: vi.fn() }));
vi.mock("@/lib/settlement/closeCrisis", () => ({ closeSettlementCrisis: vi.fn() }));

const CRISIS_ID = new ObjectId();

function crises(db: MockDb): MockCollection {
  return db.collection("settlementCrises") as unknown as MockCollection;
}

function post(body: unknown) {
  return new Request("http://localhost/api/admin/settlement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/settlement", () => {
  let db: MockDb;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = createMockDb();
    const { getDb } = await import("@/lib/mongodb");
    vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
    const { requireAdmin } = await import("@/lib/api/requireAdmin");
    vi.mocked(requireAdmin).mockResolvedValue({
      ok: true,
      admin: { userId: new ObjectId().toString(), username: "admin" },
    } as never);
    const { getGameState } = await import("@/lib/gameState");
    vi.mocked(getGameState).mockResolvedValue({ _id: "current", currentTurn: 412 } as never);
    crises(db).findOne.mockResolvedValue(null);
    const { describeQualifyingWar, warFreezeNotice } = await import("@/lib/settlement/attachToWar");
    vi.mocked(describeQualifyingWar).mockResolvedValue(null as never);
    vi.mocked(warFreezeNotice).mockReturnValue("A war is already being fought.");
  });

  describe("auth", () => {
    beforeEach(async () => {
      const { requireAdmin } = await import("@/lib/api/requireAdmin");
      vi.mocked(requireAdmin).mockResolvedValue({
        ok: false,
        response: new Response(null, { status: 403 }),
      } as never);
    });

    it("refuses a non-admin on GET and POST without touching the crisis", async () => {
      const { GET, POST } = await import("./route");
      expect((await GET()).status).toBe(403);
      expect((await POST(post({ action: "open" }))).status).toBe(403);
      const { openSettlementCrisis } = await import("@/lib/settlement/openCrisis");
      const { closeSettlementCrisis } = await import("@/lib/settlement/closeCrisis");
      expect(openSettlementCrisis).not.toHaveBeenCalled();
      expect(closeSettlementCrisis).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("reports no live question and no warning on a clear board", async () => {
      const { GET } = await import("./route");
      expect(await (await GET()).json()).toEqual({ live: null, openWarning: null });
    });

    it("reports a live question and skips the war scan", async () => {
      crises(db).findOne.mockResolvedValue({ _id: CRISIS_ID, status: "open", openedTurn: 12 });
      const { GET } = await import("./route");
      const body = await (await GET()).json();
      expect(body.live).toEqual({ id: CRISIS_ID.toString(), status: "open", openedTurn: 12 });
      const { describeQualifyingWar } = await import("@/lib/settlement/attachToWar");
      expect(describeQualifyingWar).not.toHaveBeenCalled();
    });

    it("carries the war caution while the Open button is the one on screen", async () => {
      const { describeQualifyingWar } = await import("@/lib/settlement/attachToWar");
      vi.mocked(describeQualifyingWar).mockResolvedValue({ conflictId: "c1" } as never);
      const { GET } = await import("./route");
      expect((await (await GET()).json()).openWarning).toBe("A war is already being fought.");
    });
  });

  describe("POST open", () => {
    it("opens the question on the current turn and writes an admin log", async () => {
      const { openSettlementCrisis } = await import("@/lib/settlement/openCrisis");
      vi.mocked(openSettlementCrisis).mockResolvedValue({
        opened: true,
        reason: null,
        crisisId: CRISIS_ID.toString(),
        warning: null,
      });
      const { POST } = await import("./route");
      const res = await POST(post({ action: "open" }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, crisisId: CRISIS_ID.toString() });
      expect(openSettlementCrisis).toHaveBeenCalledWith(db, { turn: 412 });
      const { createAdminLog } = await import("@/lib/adminLog");
      expect(createAdminLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "settlement_crisis_opened", adminUsername: "admin" })
      );
    });

    it("passes the live-war warning through as a warning, not a failure", async () => {
      const { openSettlementCrisis } = await import("@/lib/settlement/openCrisis");
      vi.mocked(openSettlementCrisis).mockResolvedValue({
        opened: true,
        reason: null,
        crisisId: CRISIS_ID.toString(),
        warning: "Opened into a war.",
      });
      const { POST } = await import("./route");
      const body = await (await POST(post({ action: "open" }))).json();
      expect(body).toMatchObject({ success: true, warning: "Opened into a war." });
    });

    it("refuses with 409 and no audit entry in a world where it cannot apply", async () => {
      const { openSettlementCrisis } = await import("@/lib/settlement/openCrisis");
      vi.mocked(openSettlementCrisis).mockResolvedValue({
        opened: false,
        reason: "DD is no longer a live country, so the Germanies are not separate.",
        crisisId: null,
        warning: null,
      });
      const { POST } = await import("./route");
      const res = await POST(post({ action: "open" }));
      expect(res.status).toBe(409);
      expect(JSON.stringify(await res.json())).toContain("no longer a live country");
      const { createAdminLog } = await import("@/lib/adminLog");
      expect(createAdminLog).not.toHaveBeenCalled();
    });
  });

  describe("POST close", () => {
    it("calls the question off and writes an admin log", async () => {
      const { closeSettlementCrisis } = await import("@/lib/settlement/closeCrisis");
      vi.mocked(closeSettlementCrisis).mockResolvedValue({
        closed: true,
        reason: null,
        orphanedConflictId: "war-1",
      });
      const { POST } = await import("./route");
      const res = await POST(post({ action: "close" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.note).toContain("war-1");
      const { createAdminLog } = await import("@/lib/adminLog");
      expect(createAdminLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "settlement_crisis_closed" })
      );
    });

    it("refuses with 409 when nothing is live", async () => {
      const { closeSettlementCrisis } = await import("@/lib/settlement/closeCrisis");
      vi.mocked(closeSettlementCrisis).mockResolvedValue({
        closed: false,
        reason: "No settlement crisis is live.",
        orphanedConflictId: null,
      });
      const { POST } = await import("./route");
      expect((await POST(post({ action: "close" }))).status).toBe(409);
    });
  });

  it("rejects an unknown action", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ action: "resolve" }))).status).toBe(400);
  });
});
