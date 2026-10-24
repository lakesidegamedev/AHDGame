import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { getDb, getMongoClient } from "@/lib/mongodb";
import { createSourceOwnershipProofStore } from "@/lib/auth/sourceOwnershipProof";
import {
  MigrationCoordinatorError,
  createMigrationCoordinatorClient,
  loadMigrationCoordinatorConfig,
} from "@/lib/auth/migrationCoordinator";
import { POST } from "./route";

vi.mock("@/lib/mongodb", () => ({
  getDb: vi.fn(),
  getMongoClient: vi.fn(),
}));
vi.mock("@/lib/auth/sourceOwnershipProof", () => ({
  createSourceOwnershipProofStore: vi.fn(),
}));
vi.mock("@/lib/auth/migrationCoordinator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/migrationCoordinator")>();
  return {
    ...actual,
    loadMigrationCoordinatorConfig: vi.fn(),
    createMigrationCoordinatorClient: vi.fn(),
  };
});
vi.mock("@/lib/utils/network", () => ({
  getClientIp: vi.fn(async () => "127.0.0.1"),
}));

const SOURCE_ISSUER = "urn:lakeside:legacy:ahd:production";
const SOURCE_ID = "6a1082556b36a0ff66ae250c";
const CANONICAL = "12e2ef3f-ba11-4c7a-b7d7-9655b11bf415";
const OPERATION = "7a922964-86e8-4239-a684-6bf337a6f7ba";
const PROOF = "4709b2a0-7140-4de2-a8d8-f7ec585d315e";
const RESERVATION = {
  version: 1 as const,
  sourceIssuer: SOURCE_ISSUER,
  sourceSubject: SOURCE_ID,
  canonicalAccountId: CANONICAL,
  enrollmentOperationId: OPERATION,
};
const PROOF_OBJECT = {
  proofId: PROOF,
  version: 1,
  sourceIssuer: SOURCE_ISSUER,
  sourceAccountId: SOURCE_ID,
  canonicalAccountId: CANONICAL,
  enrollmentOperationId: OPERATION,
  snapshotVersion: 1,
  snapshotDigest: "a".repeat(64),
  method: "password",
  retainedMethods: ["password"],
  observedAtMs: 1_790_000_000_000,
  expiresAtMs: 1_790_000_270_000,
  observationWindowMs: 30_000,
};

const saved = new Map<string, string | undefined>();
let proofError: Error | null;
let user: Record<string, unknown>;
let reserveError: Error | null;
let admitError: Error | null;

beforeEach(() => {
  for (const key of [
    "AHD_MIGRATION_START_ENABLED",
    "AHD_MIGRATION_COORDINATOR_URL",
    "AHD_MIGRATION_COORDINATOR_SECRET",
    "AHD_MIGRATION_SOURCE_ISSUER",
  ]) {
    saved.set(key, process.env[key]);
  }
  process.env.AHD_MIGRATION_START_ENABLED = "true";
  process.env.AHD_MIGRATION_COORDINATOR_URL = "https://coordinator.example.invalid";
  process.env.AHD_MIGRATION_COORDINATOR_SECRET = "A".repeat(32);
  process.env.AHD_MIGRATION_SOURCE_ISSUER = SOURCE_ISSUER;

  proofError = null;
  reserveError = null;
  admitError = null;
  user = { _id: new ObjectId(SOURCE_ID) };

  vi.mocked(getMongoClient).mockResolvedValue({} as never);
  vi.mocked(getDb).mockResolvedValue({
    collection: () => ({
      findOne: async () => user,
    }),
  } as never);
  vi.mocked(createSourceOwnershipProofStore).mockReturnValue({
    issuePasswordProof: async (input: {
      reserveEnrollment: (request: unknown) => Promise<unknown>;
    }) => {
      if (proofError) throw proofError;
      await input.reserveEnrollment({
        sourceIssuer: SOURCE_ISSUER,
        sourceSubject: SOURCE_ID,
      });
      return PROOF_OBJECT;
    },
    loadProof: async () => null,
  } as never);
  vi.mocked(loadMigrationCoordinatorConfig).mockReturnValue({
    baseUrl: "https://coordinator.example.invalid",
    secret: "A".repeat(32),
    sourceIssuer: SOURCE_ISSUER,
    timeoutMs: 5000,
  });
  vi.mocked(createMigrationCoordinatorClient).mockReturnValue({
    reserve: async () => {
      if (reserveError) throw reserveError;
      return RESERVATION;
    },
    admit: async () => {
      if (admitError) throw admitError;
      return { operationId: OPERATION, status: "eligible" as const };
    },
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

function request(body: unknown) {
  return new Request("https://ahd.example/api/auth/migration/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const body = { identifier: "egg3901", password: "password-123", provenance: "test" };

describe("migration start route", () => {
  it("starts the proof-backed admission and returns 202 without a session", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ operationId: OPERATION, status: "eligible" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("is hidden when the route flag is off", async () => {
    delete process.env.AHD_MIGRATION_START_ENABLED;
    expect((await POST(request(body))).status).toBe(404);
  });

  it("rejects malformed bodies", async () => {
    expect((await POST(request({ identifier: "x" }))).status).toBe(400);
    expect((await POST(request({ ...body, extra: true }))).status).toBe(400);
  });

  it("maps banned and fenced accounts before proof issuance", async () => {
    user = { _id: new ObjectId(SOURCE_ID), isBanned: true };
    expect((await POST(request({ ...body, identifier: "banned-user" }))).status).toBe(403);
    user = { _id: new ObjectId(SOURCE_ID), authMigrationFence: { v: 1 } };
    expect((await POST(request({ ...body, identifier: "fenced-user" }))).status).toBe(409);
  });

  it("maps coordinator and proof failures without leaking details", async () => {
    reserveError = new MigrationCoordinatorError("enrollment_conflict", 409);
    const conflict = await POST(request({ ...body, identifier: "coordinator-user" }));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: "enrollment_conflict" });

    proofError = Object.assign(new Error("sensitive proof detail"), {
      name: "SourceOwnershipProofError",
    });
    const proof = await POST(request({ ...body, identifier: "proof-user" }));
    expect(proof.status).toBe(401);
    await expect(proof.json()).resolves.toMatchObject({ error: "invalid_credentials" });
  });

  it("fails closed when the proof store throws an unknown outcome", async () => {
    proofError = Object.assign(new Error("unknown commit"), {
      name: "SourceOwnershipProofOutcomeUnknownError",
    });
    expect((await POST(request({ ...body, identifier: "unknown-user" }))).status).toBe(503);
  });
});
