import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { POST } from "./route";
import { requireAuth } from "@/lib/api/requireAuth";
import { proposeStateBill } from "@/lib/legislature/commands/proposeStateBill";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/api/rateLimit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ ok: true }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/legislature/commands/proposeStateBill", () => ({ proposeStateBill: vi.fn() }));
describe("Regional party proposal request validation", () => {
  const user = {
    userId: new ObjectId().toString(),
    character: { _id: new ObjectId(), name: "Chair" },
  };
  const body = {
    title: "Regional Schools Act",
    summary: "Maintain regional schools.",
    proposeViaPartyNpp: true,
    category: "education",
  };
  const post = (data = body) =>
    POST(
      new Request("http://localhost/api/country/uk/region/sco/legislature/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      { params: Promise.resolve({ code: "uk", id: "sco" }) }
    );
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ ok: true, user } as never);
    vi.mocked(proposeStateBill).mockResolvedValue({ status: 200, body: { success: true } });
  });
  it("forwards authenticated chair mode to the command without accepting forged sponsor data", async () => {
    const response = await post({
      ...body,
      sponsorNppId: new ObjectId().toString(),
    } as typeof body);
    expect(response.status).toBe(200);
    expect(proposeStateBill).toHaveBeenCalledWith({}, "UK", "sco", user, body);
  });
  it("rejects an invalid chair-mode flag before calling the command", async () => {
    expect((await post({ ...body, proposeViaPartyNpp: "true" } as never)).status).toBe(400);
    expect(proposeStateBill).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    } as never);
    expect((await post()).status).toBe(401);
    expect(proposeStateBill).not.toHaveBeenCalled();
  });
  it("preserves the command's authorization refusal", async () => {
    vi.mocked(proposeStateBill).mockResolvedValue({
      status: 403,
      body: { error: "Chair required" },
    });
    expect((await post()).status).toBe(403);
  });
});
