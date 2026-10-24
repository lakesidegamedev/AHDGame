import { createIdempotencyKey } from "@lakeside/auth-enrollment";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HEX24 = /^[0-9a-f]{24}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const TERMINAL_SOURCE_FENCE = new Set(["COMMITTED", "REPLAY_NO_MUTATION"]);
const STALE_SOURCE_FENCE = new Set(["STALE", "UNAVAILABLE"]);

export type CompletionInput = Readonly<{
  operationId: string;
  accountId: string;
  sourceAccountId: string;
  proofId: string;
  password?: string;
  provenance: string;
  authorityId: string;
}>;

export type EnrollmentView = Readonly<{
  operationId: string;
  accountId: string;
  status: "eligible" | "enrolling" | "credentialed" | "unified";
  targetUserId?: string;
}>;

export type CompletionLease = Readonly<{
  leaseToken: string;
  leaseGeneration: string | number;
  authorityId: string;
}>;

export type ProvisionedTarget = Readonly<{
  state: "COMMITTED";
  userId: string;
  receiptId: string;
}>;

export type CompletionDependencies = Readonly<{
  getEnrollment: (input: { operationId: string }) => Promise<EnrollmentView>;
  claimLease: (input: {
    operationId: string;
    authorityId: string;
    idempotencyKey: string;
    provenance: string;
  }) => Promise<CompletionLease>;
  provisionDisabledTarget: (input: {
    accountId: string;
    provenance: string;
  }) => Promise<ProvisionedTarget>;
  fenceEnrollment: (input: {
    operationId: string;
    authorityId: string;
    leaseToken: string;
    leaseGeneration: string | number;
    idempotencyKey: string;
    provenance: string;
  }) => Promise<void>;
  applySourceFence: (input: {
    proofId: string;
    provenance: string;
  }) => Promise<Readonly<{ status: string; receiptId?: string }>>;
  redriveSourceFence: (input: {
    canonicalAccountId: string;
    enrollmentOperationId: string;
    sourceAccountId: string;
    password: string;
    provenance: string;
  }) => Promise<Readonly<{ status: string; receiptId?: string }>>;
  importAndActivate: (input: {
    operationId: string;
    accountId: string;
    targetUserId: string;
    provenance: string;
  }) => Promise<Readonly<{ status: "unified"; userId: string }>>;
}>;

export class CompletionError extends Error {
  constructor(public readonly code: string) {
    super("Unified migration completion did not settle");
    this.name = "CompletionError";
  }
}

function text(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value.trim() === value &&
    !CONTROL.test(value) &&
    value.isWellFormed()
  );
}

function assertInput(input: CompletionInput): void {
  if (
    !text(input.operationId, 36) ||
    !UUID_V4.test(input.operationId) ||
    !text(input.accountId, 36) ||
    !UUID_V4.test(input.accountId) ||
    !text(input.sourceAccountId, 24) ||
    !HEX24.test(input.sourceAccountId) ||
    !text(input.proofId, 36) ||
    !UUID_V4.test(input.proofId) ||
    !text(input.provenance, 256) ||
    !text(input.authorityId, 128) ||
    (input.password !== undefined && !text(input.password, 1024))
  ) {
    throw new CompletionError("completion_invalid");
  }
}

/**
 * Complete an already admitted enrollment through the disposable migration
 * ceremony. The caller supplies the exact reservation/proof binding and the
 * injected dependencies; this function never invents a new operation, accepts
 * a caller-selected target user, or enables a target itself.
 *
 * It stops at `eligible` only. An `enrolling` operation requires an operator
 * redrive with the original lease or a fresh source proof; it is not guessed.
 * Every external write is followed by durable coordinator evidence before the
 * next step. A pending provision or a non-committed source fence is terminal
 * for this call and never authorizes import or activation.
 */
export async function completeAdmittedMigration(
  input: CompletionInput,
  dependencies: CompletionDependencies
): Promise<Readonly<{ accountId: string; userId: string }>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CompletionError("completion_invalid");
  }
  assertInput(input);
  const current = await dependencies.getEnrollment({ operationId: input.operationId });
  if (
    !current ||
    current.operationId !== input.operationId ||
    current.accountId !== input.accountId
  ) {
    throw new CompletionError("completion_invalid");
  }
  if (current.status === "unified") {
    if (!current.targetUserId || !UUID_V4.test(current.targetUserId)) {
      throw new CompletionError("completion_invalid");
    }
    return Object.freeze({ accountId: input.accountId, userId: current.targetUserId });
  }
  if (current.status !== "eligible") {
    throw new CompletionError("completion_pending");
  }

  const lease = await dependencies.claimLease({
    operationId: input.operationId,
    authorityId: input.authorityId,
    idempotencyKey: createIdempotencyKey(),
    provenance: input.provenance,
  });
  if (
    !lease ||
    lease.authorityId !== input.authorityId ||
    !text(lease.leaseToken, 512) ||
    (typeof lease.leaseGeneration !== "string" && typeof lease.leaseGeneration !== "number")
  ) {
    throw new CompletionError("completion_invalid");
  }

  let provisioned: ProvisionedTarget;
  try {
    provisioned = await dependencies.provisionDisabledTarget({
      accountId: input.accountId,
      provenance: input.provenance,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ProvisioningCeremonyError") {
      const code = (error as Error & { code?: unknown }).code;
      throw new CompletionError(
        typeof code === "string" && /^provision_[a-z_]{1,40}$/u.test(code)
          ? `completion_${code}`
          : "completion_provision_failed"
      );
    }
    throw error;
  }
  if (
    !provisioned ||
    provisioned.state !== "COMMITTED" ||
    !text(provisioned.userId, 36) ||
    !UUID_V4.test(provisioned.userId) ||
    !text(provisioned.receiptId, 36) ||
    !UUID_V4.test(provisioned.receiptId)
  ) {
    throw new CompletionError("completion_provision_pending");
  }

  await dependencies.fenceEnrollment({
    operationId: input.operationId,
    authorityId: input.authorityId,
    leaseToken: lease.leaseToken,
    leaseGeneration: lease.leaseGeneration,
    idempotencyKey: createIdempotencyKey(),
    provenance: input.provenance,
  });

  let sourceFence: Readonly<{ status: string; receiptId?: string }>;
  try {
    sourceFence = await dependencies.applySourceFence({
      proofId: input.proofId,
      provenance: input.provenance,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "SourceOwnershipProofOutcomeUnknownError") {
      throw new CompletionError("completion_source_fence_unknown");
    }
    throw error;
  }
  if (STALE_SOURCE_FENCE.has(sourceFence?.status)) {
    if (!input.password) throw new CompletionError("completion_source_fence_stale");
    sourceFence = await dependencies.redriveSourceFence({
      canonicalAccountId: input.accountId,
      enrollmentOperationId: input.operationId,
      sourceAccountId: input.sourceAccountId,
      password: input.password,
      provenance: input.provenance,
    });
  }
  if (!sourceFence || !TERMINAL_SOURCE_FENCE.has(sourceFence.status)) {
    throw new CompletionError("completion_source_fence_not_committed");
  }

  const activated = await dependencies.importAndActivate({
    operationId: input.operationId,
    accountId: input.accountId,
    targetUserId: provisioned.userId,
    provenance: input.provenance,
  });
  if (!activated || activated.status !== "unified" || activated.userId !== provisioned.userId) {
    throw new CompletionError("completion_activation_not_committed");
  }
  return Object.freeze({ accountId: input.accountId, userId: provisioned.userId });
}
