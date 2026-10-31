import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { Pool } from "pg";
import {
  createCentralFenceAttestationReader,
  createCohortEnrollment,
  createCredentialImportDispatcher,
  createCredentialImportReceiptReader,
  createEnrollmentReservationStore,
  createIdempotencyKey,
  createSourceOwnershipProofReader,
} from "@lakeside/auth-enrollment";
import { createProvisionAccessTokenProvider } from "@lakeside/account-registry";
import { getDb, getMongoClient } from "@/lib/mongodb";
import { createSourceFenceRedriver } from "@/lib/auth/sourceFenceRedrive";
import { createSourceFenceWriter } from "@/lib/auth/sourceFenceWriter";
import { createSourceOwnershipProofStore } from "@/lib/auth/sourceOwnershipProof";
import { createDisabledTargetProvisioner } from "@/lib/auth/unifiedProvisioning";
import { recoverCredentialImport } from "@/lib/auth/credentialImportRecovery";

const SOURCE_ISSUER = "urn:lakeside:legacy:ahd:production";
const AUTHORITY = "ahd-unified-cohort";
const PROVENANCE = "ahd:password-login:unified-cohort";
const HEX24 = /^[0-9a-f]{24}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type CohortTarget = Readonly<{ canonicalAccountId: string; userId: string }>;

type StoredSourceFence = Readonly<{
  proofId: string;
  receiptId: string;
  operationId: string;
  canonicalAccountId: string;
}>;

function storedSourceFence(value: unknown): StoredSourceFence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fence = value as Record<string, unknown>;
  return fence.v === 1 &&
    typeof fence.proofId === "string" &&
    UUID.test(fence.proofId) &&
    typeof fence.receiptId === "string" &&
    UUID.test(fence.receiptId) &&
    typeof fence.operationId === "string" &&
    UUID.test(fence.operationId) &&
    typeof fence.canonicalAccountId === "string" &&
    UUID.test(fence.canonicalAccountId)
    ? {
        proofId: fence.proofId,
        receiptId: fence.receiptId,
        operationId: fence.operationId,
        canonicalAccountId: fence.canonicalAccountId,
      }
    : null;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing unified migration configuration: ${name}`);
  return value;
}

function cohort(): ReadonlyMap<string, CohortTarget> {
  const parsed = JSON.parse(required("AHD_UNIFIED_COHORT_TARGETS")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid unified cohort");
  const entries = Object.entries(parsed as Record<string, CohortTarget>);
  if (entries.length !== 2) throw new Error("Invalid unified cohort");
  for (const [sourceId, target] of entries) {
    if (
      !HEX24.test(sourceId) ||
      !UUID.test(target?.canonicalAccountId) ||
      !UUID.test(target?.userId)
    ) {
      throw new Error("Invalid unified cohort");
    }
  }
  return new Map(entries);
}

/**
 * Explicit general bridge cohort. Each entry is an exact source Mongo ObjectId
 * admitted to the same proof-backed ceremony as the canary. The list is empty
 * by default and is never inferred from traffic or email.
 */
function generalCohort(): ReadonlySet<string> {
  const raw = process.env.AHD_UNIFIED_GENERAL_COHORT;
  if (raw === undefined || raw === "") return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid general unified cohort");
  }
  if (!Array.isArray(parsed) || parsed.length > 1000)
    throw new Error("Invalid general unified cohort");
  const sources = new Set<string>();
  for (const sourceId of parsed) {
    if (typeof sourceId !== "string" || !HEX24.test(sourceId) || sources.has(sourceId)) {
      throw new Error("Invalid general unified cohort");
    }
    sources.add(sourceId);
  }
  return sources;
}

function databasePool(user: string, passwordName: string, database: string): Pool {
  return new Pool({
    host: required("LAKESIDE_IDENTITY_DB_HOST"),
    port: Number(required("LAKESIDE_IDENTITY_DB_PORT")),
    database,
    user,
    password: required(passwordName),
    ssl: {
      ca: Buffer.from(required("LAKESIDE_IDENTITY_DB_CA_B64"), "base64").toString("utf8"),
      rejectUnauthorized: true,
    },
    max: 3,
    connectionTimeoutMillis: 3000,
    query_timeout: 10000,
  });
}

function tokenProvider(prefix: string) {
  return createProvisionAccessTokenProvider({
    tokenEndpoint: `${required("UNIFIED_OIDC_ISSUER")}/protocol/openid-connect/token`,
    clientId: required(`${prefix}_CLIENT_ID`),
    clientSecret: required(`${prefix}_CLIENT_SECRET`),
    timeoutMs: 5000,
  });
}

async function postAuthority(
  path: string,
  prefix: string,
  body: object
): Promise<Record<string, unknown>> {
  const token = await tokenProvider(prefix).obtainAccessToken();
  const response = await fetch(
    `${required("UNIFIED_OIDC_ISSUER")}/lakeside-provision-transport/${path}`,
    {
      method: "POST",
      redirect: "error",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    }
  );
  if (response.status !== 200) throw new Error(`Unified issuer ${path} rejected the migration`);
  return (await response.json()) as Record<string, unknown>;
}

export function isUnifiedMigrationCohort(sourceAccountId: string): boolean {
  try {
    if (cohort().has(sourceAccountId)) return true;
  } catch {
    // Fall through to the general list; the canary map is not the only cohort.
  }
  try {
    return generalCohort().has(sourceAccountId);
  } catch {
    return false;
  }
}

export async function migratePasswordLoginToUnified(sourceAccountId: string, password: string) {
  let targets = new Map<string, CohortTarget>();
  try {
    targets = new Map(cohort());
  } catch {
    // An invalid canary map must not disable an explicitly listed general source.
  }
  let general = false;
  try {
    general = generalCohort().has(sourceAccountId);
  } catch {
    general = false;
  }
  const target = targets.get(sourceAccountId);
  if (!target && !general) throw new Error("Account is not in the unified migration cohort");
  const sourceIds = target ? [...targets.keys()] : [sourceAccountId];
  const privilegedSourceIds = target ? sourceIds : [];

  const coordinator = databasePool(
    "lakeside_enrollment_runtime",
    "LAKESIDE_ENROLLMENT_RUNTIME_PASSWORD",
    "lakeside_coordinator"
  );
  const fenceReaderPool = databasePool(
    "lakeside_fence_attestation_reader",
    "LAKESIDE_FENCE_READER_PASSWORD",
    "lakeside_coordinator"
  );
  const receiptReaderPool = databasePool(
    "lakeside_provision_receipt_reader",
    "LAKESIDE_PROVISION_READER_PASSWORD",
    "railway"
  );
  const provisionCoordinator = general
    ? databasePool(
        "lakeside_registry_runtime",
        "LAKESIDE_REGISTRY_RUNTIME_PASSWORD",
        "lakeside_coordinator"
      )
    : null;
  try {
    const db = await getDb();
    const mongo = await getMongoClient();
    const targetIssuer = required("UNIFIED_OIDC_ISSUER");
    const realmId = required("UNIFIED_OIDC_REALM_ID");
    const proofStore = createSourceOwnershipProofStore({
      sourceIssuer: SOURCE_ISSUER,
      client: mongo,
      databaseName: db.databaseName,
      privilegedCohortSourceAccountIds: privilegedSourceIds,
    });
    const reservations = createEnrollmentReservationStore(coordinator, {
      allowedSourceIssuers: [SOURCE_ISSUER],
    });
    const reservation = await reservations.reserve({
      sourceIdentity: { issuer: SOURCE_ISSUER, subject: sourceAccountId },
      provenance: PROVENANCE,
    });
    if (target && reservation.canonicalAccountId !== target.canonicalAccountId)
      throw new Error("Canonical cohort mapping changed");
    const sourceProofReader = createSourceOwnershipProofReader({
      sourceIssuer: SOURCE_ISSUER,
      loadSourceProof: ({ proofId }: { proofId: string }) => proofStore.loadProof({ proofId }),
    });
    const loadCentralFenceAttestation = createCentralFenceAttestationReader(fenceReaderPool, {
      sourceIssuer: SOURCE_ISSUER,
      targetIssuer,
      targetRealmId: realmId,
    });
    const loadCommittedImportReceipt = createCredentialImportReceiptReader(receiptReaderPool, {
      issuer: targetIssuer,
      realmId,
    });
    const enrollment = createCohortEnrollment(coordinator, {
      allowedLegacyIdentities: sourceIds.map((subject) => ({ issuer: SOURCE_ISSUER, subject })),
      allowedImportIssuers: [targetIssuer],
      sourceProofReader,
      loadCommittedImportReceipt,
      abortImport: loadCommittedImportReceipt,
      loadActivationReceipt: async (binding: Record<string, unknown>) =>
        postAuthority("activation-receipt", "LAKESIDE_ACTIVATION_RECEIPT_READER", {
          accountId: binding.accountId,
          operationId: binding.operationId,
          userId: binding.userId,
          importReceiptId: binding.importReceiptId,
        }),
      leaseSeconds: 60,
    });
    const fenceWriter = createSourceFenceWriter({
      client: mongo,
      db,
      sourceIssuer: SOURCE_ISSUER,
      clockSkewBoundMs: 5000,
      clockSkewEvidence: "Production databases use provider synchronized clocks",
      loadSourceProof: ({ proofId }: { proofId: string }) => proofStore.loadProof({ proofId }),
      loadCentralFenceAttestation,
      privilegedCohortSourceAccountIds: privilegedSourceIds,
    });
    const provisioner = provisionCoordinator
      ? createDisabledTargetProvisioner({
          coordinatorPool: provisionCoordinator,
          receiptReaderPool,
          issuer: targetIssuer,
          realmId,
          obtainAccessToken: tokenProvider("LAKESIDE_PROVISION_COORDINATOR").obtainAccessToken,
        })
      : null;
    const sourceUser = await db
      .collection("users")
      .findOne({ _id: new ObjectId(sourceAccountId) }, { projection: { authMigrationFence: 1 } });
    let sourceFence = storedSourceFence(sourceUser?.authMigrationFence);
    if (sourceUser && Object.hasOwn(sourceUser, "authMigrationFence") && !sourceFence)
      throw new Error("Source fence is malformed");
    if (
      sourceFence &&
      (sourceFence.operationId !== reservation.enrollmentOperationId ||
        sourceFence.canonicalAccountId !== reservation.canonicalAccountId)
    ) {
      throw new Error("Source fence binding changed");
    }
    const centralFence = await coordinator.query(
      `SELECT 1
         FROM lakeside_enrollment.account_fence
        WHERE account_id=$1 AND operation_id=$2`,
      [reservation.canonicalAccountId, reservation.enrollmentOperationId]
    );
    let progress = await enrollment.getEnrollment(reservation.enrollmentOperationId);
    let targetUserId = target?.userId;
    if (!sourceFence && centralFence.rowCount === 0) {
      const proof = await proofStore.issuePasswordProof({
        sourceAccountId,
        password,
        reserveEnrollment: async () => reservation,
      });
      if (!progress) {
        await enrollment.admitEnrollment({
          reservation,
          proofId: proof.proofId,
          sourceAccountId,
          idempotencyKey: createIdempotencyKey(),
          provenance: PROVENANCE,
        });
      } else if (progress.status !== "eligible" && progress.status !== "enrolling") {
        throw new Error("Enrollment state is inconsistent with an unfenced source");
      }
      const claimed = await enrollment.claimEnrollment({
        operationId: reservation.enrollmentOperationId,
        idempotencyKey: createIdempotencyKey(),
        authorityId: AUTHORITY,
        provenance: PROVENANCE,
      });
      const lease = {
        operationId: reservation.enrollmentOperationId,
        authorityId: claimed.lease.authorityId,
        leaseToken: claimed.lease.leaseToken,
        leaseGeneration: claimed.lease.leaseGeneration,
      };
      if (general) {
        if (!provisioner) throw new Error("Disabled target provisioning is unavailable");
        const provisioned = await provisioner.provisionDisabledTarget({
          accountId: reservation.canonicalAccountId,
          provenance: PROVENANCE,
        });
        if (!provisioned || !UUID.test(provisioned.userId)) {
          throw new Error("Disabled target provisioning did not commit");
        }
        targetUserId = provisioned.userId;
      }
      await enrollment.fenceEnrollment({
        ...lease,
        idempotencyKey: createIdempotencyKey(),
        provenance: PROVENANCE,
      });
      const fenced = await fenceWriter.applySourceFence({
        proofId: proof.proofId,
        provenance: PROVENANCE,
      });
      if (!fenced.receiptId || !["COMMITTED", "REPLAY_NO_MUTATION"].includes(fenced.status))
        throw new Error("Source fence did not commit");
      sourceFence = {
        proofId: proof.proofId,
        receiptId: fenced.receiptId,
        operationId: reservation.enrollmentOperationId,
        canonicalAccountId: reservation.canonicalAccountId,
      };
    } else if (!sourceFence) {
      const redrive = createSourceFenceRedriver({
        sourceIssuer: SOURCE_ISSUER,
        proofStore,
        reserveEnrollment: (input) => reservations.reserve(input),
        applySourceFence: (input) => fenceWriter.applySourceFence(input),
      });
      const fenced = await redrive({
        canonicalAccountId: reservation.canonicalAccountId,
        enrollmentOperationId: reservation.enrollmentOperationId,
        sourceAccountId,
        password,
        provenance: PROVENANCE,
      });
      if (
        !fenced.proofId ||
        !fenced.receiptId ||
        !["COMMITTED", "REPLAY_NO_MUTATION"].includes(fenced.status)
      )
        throw new Error("Source fence recovery did not commit");
      sourceFence = {
        proofId: fenced.proofId,
        receiptId: fenced.receiptId,
        operationId: reservation.enrollmentOperationId,
        canonicalAccountId: reservation.canonicalAccountId,
      };
    }
    if (!sourceFence) throw new Error("Source fence is unavailable");
    if (!targetUserId) {
      const attestation = await loadCentralFenceAttestation({
        canonicalAccountId: reservation.canonicalAccountId,
        enrollmentOperationId: reservation.enrollmentOperationId,
      });
      if (!attestation || !UUID.test(attestation.targetSubject)) {
        throw new Error("Committed target subject is unavailable");
      }
      targetUserId = attestation.targetSubject;
    }
    if (!targetUserId) throw new Error("Committed target subject is unavailable");
    const material = await fenceWriter.loadCredentialImportMaterial({
      proofId: sourceFence.proofId,
      receiptId: sourceFence.receiptId,
    });
    if (!material) throw new Error("Committed credential material is unavailable");
    const importToken = tokenProvider("LAKESIDE_CREDENTIAL_IMPORT_WRITER");
    const dispatcher = createCredentialImportDispatcher({
      endpoint: `${targetIssuer}/lakeside-provision-transport`,
      issuer: targetIssuer,
      realmId,
      obtainAccessToken: importToken.obtainAccessToken,
    });
    progress = await enrollment.getEnrollment(reservation.enrollmentOperationId);
    if (progress?.status === "enrolling") {
      const loadUnresolvedAttempt = async () => {
        const storedAttempt = await coordinator.query<{
          attempt_id: string;
          binding: Record<string, unknown>;
        }>(
          `SELECT a.attempt_id::text, a.binding
           FROM lakeside_enrollment.import_attempt a
           LEFT JOIN lakeside_enrollment.import_attempt_receipt r ON r.attempt_id=a.attempt_id
           LEFT JOIN lakeside_enrollment.import_attempt_abort x ON x.attempt_id=a.attempt_id
          WHERE a.operation_id=$1 AND r.attempt_id IS NULL AND x.attempt_id IS NULL
          ORDER BY attempt_generation DESC
          LIMIT 1`,
          [reservation.enrollmentOperationId]
        );
        return storedAttempt.rows[0]
          ? { attemptId: storedAttempt.rows[0].attempt_id, binding: storedAttempt.rows[0].binding }
          : null;
      };
      await recoverCredentialImport({
        loadUnresolvedAttempt,
        loadReceipt: (binding) =>
          loadCommittedImportReceipt(binding) as Promise<Readonly<{
            state: "COMMITTED" | "ABORTED";
          }> | null>,
        abortAttempt: async (attemptId) => {
          await enrollment.abortCredentialImport({
            operationId: reservation.enrollmentOperationId,
            attemptId,
            provenance: PROVENANCE,
          });
        },
        createAttempt: async () => {
          const attempt = await enrollment.issueImportAttemptLease({
            operationId: reservation.enrollmentOperationId,
            authorityId: AUTHORITY,
            provenance: PROVENANCE,
          });
          const binding = await enrollment.bindImportAttempt({
            operationId: reservation.enrollmentOperationId,
            attemptId: attempt.attemptId,
            attemptGeneration: attempt.attemptGeneration,
            leaseToken: attempt.leaseToken,
            targetIdentity: { issuer: targetIssuer, realmId, subject: targetUserId },
            digestFingerprint: createHash("sha256").update(material.credentialDigest).digest("hex"),
            provenance: PROVENANCE,
          });
          return { attemptId: attempt.attemptId, binding };
        },
        dispatchAttempt: async (attempt) => {
          await dispatcher.importCredential(attempt.binding, material.credentialDigest);
        },
        reconcileAttempt: async (attemptId) => {
          await enrollment.reconcileImportAttempt({
            operationId: reservation.enrollmentOperationId,
            attemptId,
            provenance: PROVENANCE,
          });
        },
      });
    } else if (progress?.status !== "credentialed" && progress?.status !== "unified") {
      throw new Error("Enrollment is not ready for credential recovery");
    }
    progress = await enrollment.getEnrollment(reservation.enrollmentOperationId);
    if (progress?.status === "unified")
      return Object.freeze({ accountId: reservation.canonicalAccountId, userId: targetUserId });
    if (progress?.status !== "credentialed") throw new Error("Credential import did not reconcile");
    const activation = await enrollment.bindTargetActivation({
      operationId: reservation.enrollmentOperationId,
      provenance: PROVENANCE,
    });
    await postAuthority("activate", "LAKESIDE_ACTIVATION_COORDINATOR", {
      accountId: activation.accountId,
      operationId: activation.operationId,
      userId: activation.userId,
      importReceiptId: activation.importReceiptId,
    });
    const unified = await enrollment.reconcileTargetActivation({
      operationId: reservation.enrollmentOperationId,
      provenance: PROVENANCE,
    });
    if (unified.status !== "unified") throw new Error("Unified activation did not commit");
    return Object.freeze({ accountId: reservation.canonicalAccountId, userId: targetUserId });
  } finally {
    await Promise.allSettled([
      coordinator.end(),
      fenceReaderPool.end(),
      receiptReaderPool.end(),
      ...(provisionCoordinator ? [provisionCoordinator.end()] : []),
    ]);
  }
}
