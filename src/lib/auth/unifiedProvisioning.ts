import {
  createProvisionCoordinator,
  createProvisionDispatcher,
  createProvisionReceiptReader,
  createProvisionWorkflow,
} from "@lakeside/account-registry";
import type { Pool } from "pg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

export type ProvisionedTarget = Readonly<{
  accountId: string;
  operationId: string;
  receiptId: string;
  userId: string;
  issuer: string;
  replay: boolean;
}>;

export class ProvisioningCeremonyError extends Error {
  constructor(public readonly code: string) {
    super("Disabled target provisioning did not commit");
    this.name = "ProvisioningCeremonyError";
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

/**
 * Validate the workflow's terminal result and expose only the fields needed by
 * the next ceremony step. A candidate or pending result never authorizes the
 * central fence, credential import or activation.
 */
export function validateProvisionResult(result: unknown, issuer: string): ProvisionedTarget {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new ProvisioningCeremonyError("provision_invalid");
  }
  const value = result as Record<string, unknown>;
  if (value.state === "ABORTED") throw new ProvisioningCeremonyError("provision_aborted");
  if (value.state !== "COMMITTED") throw new ProvisioningCeremonyError("provision_pending");
  const accountId = value.accountId;
  const operationId = value.operationId;
  const receiptId = value.receiptId;
  const userId = value.userId;
  const replay = value.replay;
  if (
    value.issuer !== issuer ||
    !text(accountId, 36) ||
    !UUID.test(accountId) ||
    !text(operationId, 36) ||
    !UUID.test(operationId) ||
    !text(receiptId, 36) ||
    !UUID.test(receiptId) ||
    !text(userId, 36) ||
    !UUID.test(userId) ||
    typeof replay !== "boolean"
  ) {
    throw new ProvisioningCeremonyError("provision_invalid");
  }
  return Object.freeze({
    accountId,
    operationId,
    receiptId,
    userId,
    issuer,
    replay,
  });
}

export type DisabledTargetProvisioner = Readonly<{
  provisionDisabledTarget: (input: {
    accountId: string;
    provenance: string;
    signal?: AbortSignal;
  }) => Promise<ProvisionedTarget>;
}>;

/**
 * Compose the durable provision coordinator, authenticated receipt reader,
 * issuer dispatcher and bounded workflow. This factory does not start
 * enrollment, write either fence, import a credential, enable a target or
 * issue a session. It only provisions a disabled target and returns the
 * committed receipt binding.
 */
export function createDisabledTargetProvisioner(input: {
  coordinatorPool: Pool;
  receiptReaderPool: Pool;
  issuer: string;
  realmId: string;
  obtainAccessToken: (options?: { signal?: AbortSignal }) => Promise<string>;
  leaseMs?: number;
}): DisabledTargetProvisioner {
  if (!input || typeof input !== "object") throw new TypeError("Invalid provisioner configuration");
  if (
    !text(input.issuer, 512) ||
    !input.issuer.startsWith("https://") ||
    input.issuer.endsWith("/")
  ) {
    throw new TypeError("Invalid provision issuer");
  }
  if (!text(input.realmId, 255)) throw new TypeError("Invalid provision realm");
  if (typeof input.obtainAccessToken !== "function")
    throw new TypeError("A token provider is required");
  if (!input.coordinatorPool || typeof input.coordinatorPool.connect !== "function") {
    throw new TypeError("A coordinator pool is required");
  }
  if (!input.receiptReaderPool || typeof input.receiptReaderPool.connect !== "function") {
    throw new TypeError("A receipt reader pool is required");
  }
  const leaseMs = input.leaseMs ?? 60_000;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 100 || leaseMs > 60_000) {
    throw new TypeError("Invalid provision lease duration");
  }

  const coordinator = createProvisionCoordinator(input.coordinatorPool, {
    allowedProvisionIssuers: [input.issuer],
    loadProvisionReceipt: createProvisionReceiptReader(input.receiptReaderPool, {
      issuer: input.issuer,
      realmId: input.realmId,
    }),
  });
  const dispatcher = createProvisionDispatcher({
    endpoint: `${input.issuer}/lakeside-provision-transport`,
    issuer: input.issuer,
    realmId: input.realmId,
    obtainAccessToken: input.obtainAccessToken,
  });
  const workflow = createProvisionWorkflow({
    coordinator,
    dispatcher,
    issuer: input.issuer,
    realmId: input.realmId,
    leaseMs,
  });

  return Object.freeze({
    async provisionDisabledTarget({ accountId, provenance, signal }) {
      if (!text(accountId, 36) || !UUID.test(accountId) || !text(provenance, 256)) {
        throw new ProvisioningCeremonyError("provision_invalid");
      }
      const result = await workflow.provisionDisabledAccount({
        accountId,
        provenance,
        ...(signal ? { signal } : {}),
      });
      return validateProvisionResult(result, input.issuer);
    },
  });
}
