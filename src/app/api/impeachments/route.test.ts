import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { GET, POST } from "./route";
import { getDb } from "@/lib/mongodb";
import { requireBasicAuth } from "@/lib/api/requireAuth";
import { getAuthUser } from "@/lib/auth";
import { getCharacterByUserId } from "@/lib/db/characterLookup";
import { fileArticlesOfImpeachment } from "@/lib/impeachment/fileArticles";
import { resolvePartyImpeachmentSponsor } from "@/lib/impeachment/partySponsor";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireBasicAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/db/characterLookup", () => ({ getCharacterByUserId: vi.fn() }));
vi.mock("@/lib/impeachment/fileArticles", () => ({ fileArticlesOfImpeachment: vi.fn() }));
vi.mock("@/lib/impeachment/partySponsor", () => ({ resolvePartyImpeachmentSponsor: vi.fn() }));
const actor = { _id: new ObjectId(), name: "Chair", countryId: "US", party: "1" };
const request = (body: unknown) =>
  new Request("http://localhost/api/impeachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getDb).mockResolvedValue(createMockDb() as never);
  vi.mocked(requireBasicAuth).mockResolvedValue({
    ok: true,
    user: { userId: new ObjectId().toString(), isAdmin: false },
  } as never);
  vi.mocked(getCharacterByUserId).mockResolvedValue(actor as never);
  vi.mocked(fileArticlesOfImpeachment).mockResolvedValue({
    impeachmentId: new ObjectId().toString(),
  });
});
describe("impeachment party sponsorship API", () => {
  it("passes a normalized regional scope and explicit NPP mode to the command", async () => {
    expect(
      (
        await POST(
          request({ countryId: "US", office: "governor", state: "ny", proposeViaPartyNpp: true })
        )
      ).status
    ).toBe(200);
    expect(fileArticlesOfImpeachment).toHaveBeenCalledWith(
      expect.anything(),
      "US",
      actor,
      false,
      expect.objectContaining({ office: "governor", state: "NY", proposeViaPartyNpp: true })
    );
  });
  it("preserves character filing as the default", async () => {
    expect(
      (await POST(request({ countryId: "US", targetCharacterId: new ObjectId().toString() })))
        .status
    ).toBe(200);
    expect(fileArticlesOfImpeachment).toHaveBeenCalledWith(
      expect.anything(),
      "US",
      actor,
      false,
      expect.objectContaining({ proposeViaPartyNpp: false })
    );
  });
  it("rejects a malformed sponsorship flag", async () => {
    expect((await POST(request({ countryId: "US", proposeViaPartyNpp: "true" }))).status).toBe(400);
    expect(fileArticlesOfImpeachment).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    vi.mocked(requireBasicAuth).mockResolvedValue({
      ok: false,
      response: new NextResponse(null, { status: 401 }),
    });
    expect((await POST(request({ countryId: "US", proposeViaPartyNpp: true }))).status).toBe(401);
    expect(fileArticlesOfImpeachment).not.toHaveBeenCalled();
  });
  it("exposes the party button only when a current seated sponsor is available", async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: new ObjectId().toString() } as never);
    vi.mocked(resolvePartyImpeachmentSponsor).mockResolvedValue({
      authorized: true,
      npp: { _id: new ObjectId(), name: "NPP", party: "1" },
    });
    const res = await GET(
      new Request("http://localhost/api/impeachments?countryId=US&office=governor&state=NY")
    );
    expect(res.status).toBe(200);
    expect((await res.json()).canFileViaPartyNpp).toBe(true);
    expect(resolvePartyImpeachmentSponsor).toHaveBeenCalledWith(
      expect.anything(),
      "US",
      actor,
      "governor",
      "NY"
    );
  });
});
