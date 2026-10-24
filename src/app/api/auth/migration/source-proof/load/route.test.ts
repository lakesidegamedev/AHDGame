import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, getMongoClient } from "@/lib/mongodb";
import { createSourceOwnershipProofStore } from "@/lib/auth/sourceOwnershipProof";
import { POST } from "./route";

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
}));
vi.mock("@/lib/auth/sourceOwnershipProof", () => ({
  createSourceOwnershipProofStore: vi.fn(),
}));
vi.mock("@/lib/utils/network", () => ({
  getClientIp: vi.fn(async () => "127.0.0.1"),
}));

const SECRET = "A".repeat(32);
const PROOF_ID = "4709b2a0-7140-4de2-a8d8-f7ec585d315e";
const ISSUER = "urn:lakeside:legacy:ahd:production";
const loaded = {
  proof: {
    proofId: PROOF_ID,
    version: 1,
    sourceIssuer: ISSUER,
    sourceAccountId: "6a1082556b36a0ff66ae250c",
    canonicalAccountId: "12e2ef3f-ba11-4c7a-b7d7-9655b11bf415",
    enrollmentOperationId: "7a922964-86e8-4239-a684-6bf337a6f7ba",
    snapshotVersion: 1,
    snapshotDigest: "a".repeat(64),
    method: "password",
    retainedMethods: ["password"],
    observedAtMs: 1_790_000_000_000,
    expiresAtMs: 1_790_000_270_000,
    observationWindowMs: 30_000,
  },
  sourceNowMs: 1_790_000_010_000,
  expired: false,
};

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of [
    "AHD_MIGRATION_PROOF_LOAD_ENABLED",
    "AHD_MIGRATION_PROOF_LOAD_SECRET",
    "AHD_MIGRATION_SOURCE_ISSUER",
  ]) {
    saved.set(key, process.env[key]);
  }
  process.env.AHD_MIGRATION_PROOF_LOAD_ENABLED = "true";
  process.env.AHD_MIGRATION_PROOF_LOAD_SECRET = SECRET;
  process.env.AHD_MIGRATION_SOURCE_ISSUER = ISSUER;
  vi.mocked(getMongoClient).mockResolvedValue({} as never);
  vi.mocked(getDb).mockResolvedValue({ databaseName: "test" } as never);
  vi.mocked(createSourceOwnershipProofStore).mockReturnValue({
    loadProof: vi.fn(async () => loaded),
  } as never);
});

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
  vi.clearAllMocks();
});

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://ahd.example/api/auth/migration/source-proof/load", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("source proof load route", () => {
  it("returns the exact durable proof wrapper for an authenticated coordinator", async () => {
    const response = await POST(request({ proofId: PROOF_ID }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(loaded);
    expect(createSourceOwnershipProofStore).toHaveBeenCalledWith({
      sourceIssuer: ISSUER,
      client: {},
      db: { databaseName: "test" },
    });
  });

  it("is hidden when the route flag is off", async () => {
    delete process.env.AHD_MIGRATION_PROOF_LOAD_ENABLED;
    expect((await POST(request({ proofId: PROOF_ID }))).status).toBe(404);
  });

  it("requires the exact bearer secret and rejects browser headers", async () => {
    expect(
      (await POST(request({ proofId: PROOF_ID }, { Authorization: `Bearer ${"C".repeat(32)}` })))
        .status
    ).toBe(401);
    expect(
      (await POST(request({ proofId: PROOF_ID }, { Origin: "https://evil.example" }))).status
    ).toBe(403);
    expect((await POST(request({ proofId: PROOF_ID }, { Cookie: "a=b" }))).status).toBe(403);
  });

  it("returns 404 for a missing proof and 400 for a malformed body", async () => {
    vi.mocked(createSourceOwnershipProofStore).mockReturnValue({
      loadProof: vi.fn(async () => null),
    } as never);
    expect((await POST(request({ proofId: PROOF_ID }))).status).toBe(404);
    expect((await POST(request({ proofId: "not-a-uuid" }))).status).toBe(400);
    expect((await POST(request({ proofId: PROOF_ID, extra: true }))).status).toBe(400);
  });

  it("fails closed when the source store is unavailable", async () => {
    vi.mocked(createSourceOwnershipProofStore).mockReturnValue({
      loadProof: vi.fn(async () => {
        throw new Error("mongo down");
      }),
    } as never);
    expect((await POST(request({ proofId: PROOF_ID }))).status).toBe(503);
  });
});
