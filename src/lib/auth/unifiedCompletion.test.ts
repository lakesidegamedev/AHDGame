import { describe, expect, it, vi } from "vitest";
import {
  CompletionError,
  completeAdmittedMigration,
  type CompletionDependencies,
  type EnrollmentView,
} from "./unifiedCompletion";

const ACCOUNT = "12e2ef3f-ba11-4c7a-b7d7-9655b11bf415";
const OPERATION = "7a922964-86e8-4239-a684-6bf337a6f7ba";
const SOURCE = "6a1082556b36a0ff66ae250c";
const PROOF = "4709b2a0-7140-4de2-a8d8-f7ec585d315e";
const USER = "a0f5e7e3-0ea6-4567-b581-2e170ed5fec2";
const RECEIPT = "709c92ed-ae20-4c32-82ac-6060ded7ce92";
const INPUT = {
  operationId: OPERATION,
  accountId: ACCOUNT,
  sourceAccountId: SOURCE,
  proofId: PROOF,
  password: "password-123",
  provenance: "test:complete",
  authorityId: "ahd-ceremony",
};

type Harness = {
  calls: string[];
  deps: CompletionDependencies;
  getEnrollment: ReturnType<typeof vi.fn>;
  claimLease: ReturnType<typeof vi.fn>;
  provision: ReturnType<typeof vi.fn>;
  fence: ReturnType<typeof vi.fn>;
  source: ReturnType<typeof vi.fn>;
  redrive: ReturnType<typeof vi.fn>;
  activate: ReturnType<typeof vi.fn>;
};

function harness(
  view: EnrollmentView = { operationId: OPERATION, accountId: ACCOUNT, status: "eligible" }
): Harness {
  const calls: string[] = [];
  const getEnrollment = vi.fn(async () => view);
  const claimLease = vi.fn(async (input) => {
    calls.push("claim");
    return { leaseToken: "lease-token", leaseGeneration: "1", authorityId: input.authorityId };
  });
  const provision = vi.fn(async () => {
    calls.push("provision");
    return { state: "COMMITTED" as const, userId: USER, receiptId: RECEIPT };
  });
  const fence = vi.fn(async () => {
    calls.push("fence");
  });
  const source = vi.fn(async () => {
    calls.push("source");
    return { status: "COMMITTED", receiptId: RECEIPT };
  });
  const redrive = vi.fn(async () => {
    calls.push("redrive");
    return { status: "COMMITTED", receiptId: RECEIPT };
  });
  const activate = vi.fn(async () => {
    calls.push("activate");
    return { status: "unified" as const, userId: USER };
  });
  return {
    calls,
    getEnrollment,
    claimLease,
    provision,
    fence,
    source,
    redrive,
    activate,
    deps: {
      getEnrollment,
      claimLease,
      provisionDisabledTarget: provision,
      fenceEnrollment: fence,
      applySourceFence: source,
      redriveSourceFence: redrive,
      importAndActivate: activate,
    },
  };
}

describe("completeAdmittedMigration", () => {
  it("claims, provisions a committed target, fences both sides and activates in order", async () => {
    const h = harness();
    const result = await completeAdmittedMigration(INPUT, h.deps);
    expect(result).toEqual({ accountId: ACCOUNT, userId: USER });
    expect(h.calls).toEqual(["claim", "provision", "fence", "source", "activate"]);
    expect(h.claimLease).toHaveBeenCalledWith({
      operationId: OPERATION,
      authorityId: "ahd-ceremony",
      idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      provenance: "test:complete",
    });
    expect(h.provision).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      provenance: "test:complete",
    });
    expect(h.fence).toHaveBeenCalledWith({
      operationId: OPERATION,
      authorityId: "ahd-ceremony",
      leaseToken: "lease-token",
      leaseGeneration: "1",
      idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      provenance: "test:complete",
    });
    expect(h.source).toHaveBeenCalledWith({ proofId: PROOF, provenance: "test:complete" });
    expect(h.activate).toHaveBeenCalledWith({
      operationId: OPERATION,
      accountId: ACCOUNT,
      targetUserId: USER,
      provenance: "test:complete",
    });
  });

  it("returns an already unified account without touching any dependency", async () => {
    const h = harness({
      operationId: OPERATION,
      accountId: ACCOUNT,
      status: "unified",
      targetUserId: USER,
    });
    await expect(completeAdmittedMigration(INPUT, h.deps)).resolves.toEqual({
      accountId: ACCOUNT,
      userId: USER,
    });
    expect(h.calls).toEqual([]);
  });

  it("does not guess an enrolling or credentialed operation", async () => {
    for (const status of ["enrolling", "credentialed"] as const) {
      const h = harness({ operationId: OPERATION, accountId: ACCOUNT, status });
      await expect(completeAdmittedMigration(INPUT, h.deps)).rejects.toMatchObject({
        code: "completion_pending",
      });
      expect(h.calls).toEqual([]);
    }
  });

  it("stops before fencing when the target provision is not committed", async () => {
    const h = harness();
    h.provision.mockImplementation(async () => {
      h.calls.push("provision");
      throw Object.assign(new Error("pending"), {
        name: "ProvisioningCeremonyError",
        code: "provision_pending",
      });
    });
    await expect(completeAdmittedMigration(INPUT, h.deps)).rejects.toMatchObject({
      code: "completion_provision_pending",
    });
    expect(h.calls).toEqual(["claim", "provision"]);
    expect(h.fence).not.toHaveBeenCalled();
  });

  it("redrives a stale source proof under the same operation when a password is present", async () => {
    const h = harness();
    h.source.mockImplementation(async () => {
      h.calls.push("source");
      return { status: "STALE" };
    });
    await completeAdmittedMigration(INPUT, h.deps);
    expect(h.calls).toEqual(["claim", "provision", "fence", "source", "redrive", "activate"]);
    expect(h.redrive).toHaveBeenCalledWith({
      canonicalAccountId: ACCOUNT,
      enrollmentOperationId: OPERATION,
      sourceAccountId: SOURCE,
      password: "password-123",
      provenance: "test:complete",
    });
  });

  it("fails closed on a stale source proof without a password", async () => {
    const h = harness();
    h.source.mockResolvedValue({ status: "STALE" });
    const { password: _password, ...withoutPassword } = INPUT;
    await expect(completeAdmittedMigration(withoutPassword, h.deps)).rejects.toMatchObject({
      code: "completion_source_fence_stale",
    });
    expect(h.activate).not.toHaveBeenCalled();
  });

  it("does not report success until activation is unified", async () => {
    const h = harness();
    h.activate.mockResolvedValue({ status: "credentialed", userId: USER } as never);
    await expect(completeAdmittedMigration(INPUT, h.deps)).rejects.toBeInstanceOf(CompletionError);
  });

  it("rejects an operation or account mismatch before claiming", async () => {
    const h = harness({
      operationId: OPERATION,
      accountId: "9517ea24-5659-4170-ba44-257f86d66c5e",
      status: "eligible",
    });
    await expect(completeAdmittedMigration(INPUT, h.deps)).rejects.toMatchObject({
      code: "completion_invalid",
    });
    expect(h.claimLease).not.toHaveBeenCalled();
  });
});
