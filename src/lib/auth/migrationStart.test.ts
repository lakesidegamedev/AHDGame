import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { MigrationStartError, migrateSourceAccount } from "./migrationStart";
import type { SourceOwnershipProofStore } from "./sourceOwnershipProof";
import type { MigrationCoordinatorClient, MigrationReservation } from "./migrationCoordinator";

const SOURCE_ISSUER = "urn:lakeside:legacy:ahd:production";
const SOURCE_ID = "6a1082556b36a0ff66ae250c";
const CANONICAL = "12e2ef3f-ba11-4c7a-b7d7-9655b11bf415";
const OPERATION = "7a922964-86e8-4239-a684-6bf337a6f7ba";
const PROOF = "4709b2a0-7140-4de2-a8d8-f7ec585d315e";
const RESERVATION: MigrationReservation = {
  version: 1,
  sourceIssuer: SOURCE_ISSUER,
  sourceSubject: SOURCE_ID,
  canonicalAccountId: CANONICAL,
  enrollmentOperationId: OPERATION,
};

function user(overrides: Record<string, unknown> = {}) {
  return { _id: new ObjectId(SOURCE_ID), ...overrides };
}

function dbWith(found: unknown): Db {
  return {
    collection: () => ({
      findOne: async () => found,
    }),
  } as unknown as Db;
}

function proofStore(overrides: Partial<SourceOwnershipProofStore> = {}): SourceOwnershipProofStore {
  return {
    issuePasswordProof: async (input) => {
      await input.reserveEnrollment({
        sourceIssuer: SOURCE_ISSUER,
        sourceSubject: SOURCE_ID,
        signal: new AbortController().signal,
      });
      return {
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
    },
    loadProof: async () => null,
    ...overrides,
  } as SourceOwnershipProofStore;
}

function coordinator(
  overrides: Partial<MigrationCoordinatorClient> = {}
): MigrationCoordinatorClient {
  return {
    reserve: vi.fn(async () => RESERVATION),
    admit: vi.fn(async () => ({ operationId: OPERATION, status: "eligible" as const })),
    ...overrides,
  } as MigrationCoordinatorClient;
}

const request = {
  identifier: "egg3901",
  password: "password-123",
  provenance: "test:migration",
};

describe("migrateSourceAccount", () => {
  it("verifies, reserves and admits without issuing a session", async () => {
    const reserve = vi.fn(async () => RESERVATION);
    const admit = vi.fn(async () => ({ operationId: OPERATION, status: "eligible" as const }));
    const result = await migrateSourceAccount({
      db: dbWith(user()),
      proofStore: proofStore(),
      coordinator: coordinator({ reserve, admit }),
      sourceIssuer: SOURCE_ISSUER,
      request,
    });
    expect(result).toEqual({ operationId: OPERATION, status: "eligible" });
    expect(reserve).toHaveBeenCalledWith({
      subject: SOURCE_ID,
      provenance: "test:migration",
    });
    expect(admit).toHaveBeenCalledWith({
      reservation: RESERVATION,
      proofId: PROOF,
      sourceAccountId: SOURCE_ID,
      idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      provenance: "test:migration",
    });
  });

  it("normalizes the identifier and rejects an unknown account with a generic 401", async () => {
    const collection = {
      findOne: vi.fn(async () => null),
    };
    const db = { collection: () => collection } as unknown as Db;
    await expect(
      migrateSourceAccount({
        db,
        proofStore: proofStore(),
        coordinator: coordinator(),
        sourceIssuer: SOURCE_ISSUER,
        request: { ...request, identifier: "  Egg3901  " },
      })
    ).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
    expect(collection.findOne).toHaveBeenCalledWith(
      { $or: [{ email: "egg3901" }, { username: "egg3901" }] },
      { projection: { _id: 1, isBanned: 1, authMigrationFence: 1 } }
    );
  });

  it("rejects banned and already fenced accounts before proof issuance", async () => {
    await expect(
      migrateSourceAccount({
        db: dbWith(user({ isBanned: true })),
        proofStore: proofStore(),
        coordinator: coordinator(),
        sourceIssuer: SOURCE_ISSUER,
        request,
      })
    ).rejects.toMatchObject({ status: 403, code: "banned" });

    await expect(
      migrateSourceAccount({
        db: dbWith(user({ authMigrationFence: { v: 1 } })),
        proofStore: proofStore(),
        coordinator: coordinator(),
        sourceIssuer: SOURCE_ISSUER,
        request,
      })
    ).rejects.toMatchObject({ status: 409, code: "already_migrated" });
  });

  it("rejects a reservation that changes the account or operation binding", async () => {
    for (const changed of [
      { ...RESERVATION, sourceSubject: "6a108eec811f9923d77a6ebe" },
      { ...RESERVATION, enrollmentOperationId: "8209dad5-7634-4087-9d74-64341fecd699" },
    ]) {
      await expect(
        migrateSourceAccount({
          db: dbWith(user()),
          proofStore: proofStore(),
          coordinator: coordinator({ reserve: async () => changed }),
          sourceIssuer: SOURCE_ISSUER,
          request,
        })
      ).rejects.toBeInstanceOf(MigrationStartError);
    }
  });

  it("fails closed when the proof store never supplies a reservation", async () => {
    await expect(
      migrateSourceAccount({
        db: dbWith(user()),
        proofStore: proofStore({
          issuePasswordProof: async () => {
            throw Object.assign(new Error("proof failed"), { name: "SourceOwnershipProofError" });
          },
        }),
        coordinator: coordinator(),
        sourceIssuer: SOURCE_ISSUER,
        request,
      })
    ).rejects.toMatchObject({ name: "SourceOwnershipProofError" });
  });
});
