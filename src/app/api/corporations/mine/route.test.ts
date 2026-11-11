import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { getAuthUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/errors", () => ({
  handleRouteError: vi.fn(() => new Response("Unavailable", { status: 500 })),
}));

const userId = new ObjectId();
const characterId = new ObjectId();
const corporationId = new ObjectId();
const request = () => new Request("https://example.com/api/corporations/mine");
let db: MockDb;

beforeEach(() => {
  vi.resetAllMocks();
  db = createMockDb();
  vi.mocked(getDb).mockResolvedValue(db as never);
  vi.mocked(getAuthUser).mockResolvedValue({ userId: userId.toHexString() } as never);
  db.collection("users").findOne.mockResolvedValue({ _id: userId });
  db.collection("characters").findOne.mockResolvedValue({ _id: characterId });
  db.collection("corporations").findOne.mockResolvedValue({ _id: corporationId, sequentialId: 42 });
});

async function expectDestination(path: string) {
  const response = await GET(request());
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(path);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

describe("GET /api/corporations/mine", () => {
  it("redirects with a relative location even when the request URL is an internal origin", async () => {
    const response = await GET(new Request("http://localhost:8080/api/corporations/mine"));
    expect(response.headers.get("location")).toBe("/corporation/42");
    expect(response.headers.get("location")).not.toMatch(/^https?:/);
  });

  it("resolves the current company again after a reset or CEO change", async () => {
    await expectDestination("/corporation/42");
    db.collection("corporations").findOne.mockResolvedValue({
      _id: corporationId,
      sequentialId: 77,
    });
    await expectDestination("/corporation/77");
    expect(db.collection("corporations").findOne).toHaveBeenCalledTimes(2);
    expect(db.collection("corporations").findOne).toHaveBeenLastCalledWith(
      { ceoId: characterId, ceoVacant: { $ne: true }, imfInstitution: { $ne: true } },
      { projection: { _id: 1, sequentialId: 1 } }
    );
  });

  it("resolves the account's selected character with ownership verification", async () => {
    db.collection("users").findOne.mockResolvedValue({ activeCharacterId: characterId });
    await expectDestination("/corporation/42");
    expect(db.collection("characters").findOne).toHaveBeenCalledWith(
      { _id: characterId, userId },
      { projection: { _id: 1 } }
    );
  });

  it("resolves an owned imperial character's company", async () => {
    db.collection("users").findOne.mockResolvedValue({
      activeCharacterType: "imperial",
      activeImperialCharacterId: characterId,
    });
    db.collection("imperialCharacters").findOne.mockResolvedValue({ _id: characterId });
    await expectDestination("/corporation/42");
    expect(db.collection("imperialCharacters").findOne).toHaveBeenCalledWith(
      { _id: characterId, userId },
      { projection: { _id: 1 } }
    );
    expect(db.collection("corporations").findOne).toHaveBeenCalledWith(
      expect.objectContaining({ ceoType: "imperial" }),
      expect.anything()
    );
    expect(db.collection("characters").findOne).not.toHaveBeenCalled();
  });

  it("does not resolve another character when the selected character is missing", async () => {
    db.collection("characters").findOne.mockResolvedValue(null);
    await expectDestination("/market");
    expect(db.collection("corporations").findOne).not.toHaveBeenCalled();
  });

  it("handles a player who no longer runs a company", async () => {
    db.collection("corporations").findOne.mockResolvedValue(null);
    await expectDestination("/market");
  });

  it("uses the ObjectId when a company has no sequential number", async () => {
    db.collection("corporations").findOne.mockResolvedValue({ _id: corporationId });
    await expectDestination(`/corporation/${corporationId.toHexString()}`);
  });

  it("preserves a zero sequential number", async () => {
    db.collection("corporations").findOne.mockResolvedValue({
      _id: corporationId,
      sequentialId: 0,
    });
    await expectDestination("/corporation/0");
  });

  it("requires authentication before querying the database", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    await expectDestination("/login");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("requires the account to still exist", async () => {
    db.collection("users").findOne.mockResolvedValue(null);
    await expectDestination("/login");
  });

  it("does not fall back to a standard character from an empty imperial selection", async () => {
    db.collection("users").findOne.mockResolvedValue({ activeCharacterType: "imperial" });
    await expectDestination("/market");
    expect(db.collection("characters").findOne).not.toHaveBeenCalled();
    expect(db.collection("corporations").findOne).not.toHaveBeenCalled();
  });
});
