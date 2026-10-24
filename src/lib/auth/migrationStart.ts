import { ObjectId, type Db } from "mongodb";
import { isAuthMigrationFenced } from "@/lib/auth/sourceFence";
import type { SourceOwnershipProofStore } from "@/lib/auth/sourceOwnershipProof";
import type {
  MigrationCoordinatorClient,
  MigrationReservation,
} from "@/lib/auth/migrationCoordinator";

const DEFAULT_PROVENANCE = "ahd:password-login:web-migration";

export type MigrationStartInput = Readonly<{
  identifier: string;
  password: string;
  provenance?: string;
}>;

export type MigrationStartResult = Readonly<{
  operationId: string;
  status: "eligible";
}>;

export class MigrationStartError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super("Migration start rejected");
    this.name = "MigrationStartError";
  }
}

type StartUser = {
  _id: ObjectId;
  isBanned?: boolean;
  authMigrationFence?: unknown;
};

/**
 * Source-side first half of the proof-backed migration ceremony.
 *
 * It resolves the legacy account from the supplied identifier, verifies fresh
 * password ownership through the durable proof store, reserves the exact
 * coordinator identifiers, and admits the reservation. It does not provision,
 * fence, import, activate or issue a unified session. Those steps remain a
 * separate trusted ceremony with their own receipts.
 */
export async function migrateSourceAccount(input: {
  db: Db;
  proofStore: SourceOwnershipProofStore;
  coordinator: MigrationCoordinatorClient;
  sourceIssuer: string;
  request: MigrationStartInput;
}): Promise<MigrationStartResult> {
  const identifier = input.request.identifier.trim().toLowerCase();
  if (identifier.length < 1 || identifier.length > 320) {
    throw new MigrationStartError(400, "invalid_request");
  }
  const collection = input.db.collection<StartUser>("users");
  const user = await collection.findOne(
    { $or: [{ email: identifier }, { username: identifier }] },
    { projection: { _id: 1, isBanned: 1, authMigrationFence: 1 } }
  );
  if (!user) throw new MigrationStartError(401, "invalid_credentials");
  if (user.isBanned) throw new MigrationStartError(403, "banned");
  if (isAuthMigrationFenced(user)) throw new MigrationStartError(409, "already_migrated");

  const sourceAccountId = user._id.toHexString();
  const provenance = input.request.provenance ?? DEFAULT_PROVENANCE;
  let issued: MigrationReservation | undefined;
  const proof = await input.proofStore.issuePasswordProof({
    sourceAccountId,
    password: input.request.password,
    reserveEnrollment: async (request) => {
      if (
        request.sourceIssuer !== input.sourceIssuer ||
        request.sourceSubject !== sourceAccountId
      ) {
        throw new MigrationStartError(409, "migration_conflict");
      }
      const reserved = await input.coordinator.reserve({
        subject: request.sourceSubject,
        provenance,
      });
      issued = reserved;
      return reserved;
    },
  });
  const reservation = issued;
  if (!reservation) throw new MigrationStartError(503, "migration_unavailable");
  if (
    reservation.sourceIssuer !== input.sourceIssuer ||
    reservation.sourceSubject !== sourceAccountId ||
    proof.enrollmentOperationId !== reservation.enrollmentOperationId
  ) {
    throw new MigrationStartError(409, "migration_conflict");
  }

  // The proof UUID is unique, deterministic for an exact retry, and already
  // within the coordinator's 32-256 character idempotency-key contract. Do not
  // derive a key from the proof object with a password-style hash.
  const idempotencyKey = proof.proofId;
  const admitted = await input.coordinator.admit({
    reservation,
    proofId: proof.proofId,
    sourceAccountId,
    idempotencyKey,
    provenance,
  });
  return Object.freeze({ operationId: admitted.operationId, status: admitted.status });
}
