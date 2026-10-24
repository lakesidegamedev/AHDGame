import { describe, expect, it, vi } from "vitest";
import {
  createProvisionCoordinator,
  createProvisionDispatcher,
  createProvisionReceiptReader,
  createProvisionWorkflow,
} from "@lakeside/account-registry";
import type { Pool } from "pg";
import {
  ProvisioningCeremonyError,
  createDisabledTargetProvisioner,
  validateProvisionResult,
} from "./unifiedProvisioning";

vi.mock("@lakeside/account-registry", () => ({
  createProvisionCoordinator: vi.fn(),
  createProvisionDispatcher: vi.fn(),
  createProvisionReceiptReader: vi.fn(),
  createProvisionWorkflow: vi.fn(),
}));

const ISSUER = "https://auth.example.invalid/realms/accounts";
const REALM = "accounts";
const ACCOUNT = "12e2ef3f-ba11-4c7a-b7d7-9655b11bf415";
const OPERATION = "7a922964-86e8-4239-a684-6bf337a6f7ba";
const RECEIPT = "709c92ed-ae20-4c32-82ac-6060ded7ce92";
const USER = "a0f5e7e3-0ea6-4567-b581-2e170ed5fec2";
const committed = {
  state: "COMMITTED",
  accountId: ACCOUNT,
  operationId: OPERATION,
  attemptId: "8209dad5-7634-4087-9d74-64341fecd699",
  attemptGeneration: 1,
  receiptId: RECEIPT,
  userId: USER,
  issuer: ISSUER,
  replay: false,
};

function pool() {
  return { connect: vi.fn() } as unknown as Pool;
}

describe("validateProvisionResult", () => {
  it("returns only the committed receipt binding", () => {
    expect(validateProvisionResult(committed, ISSUER)).toEqual({
      accountId: ACCOUNT,
      operationId: OPERATION,
      receiptId: RECEIPT,
      userId: USER,
      issuer: ISSUER,
      replay: false,
    });
  });

  it("rejects pending, aborted, mismatched and malformed results", () => {
    for (const [value, code] of [
      [{ ...committed, state: "PENDING" }, "provision_pending"],
      [{ ...committed, state: "ABORTED" }, "provision_aborted"],
      [{ ...committed, issuer: "https://other.example.invalid" }, "provision_invalid"],
      [{ ...committed, userId: "not-a-uuid" }, "provision_invalid"],
      [{ ...committed, receiptId: null }, "provision_invalid"],
      [null, "provision_invalid"],
    ] as const) {
      let caught: unknown;
      try {
        validateProvisionResult(value, ISSUER);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ProvisioningCeremonyError);
      expect((caught as ProvisioningCeremonyError).code).toBe(code);
    }
  });
});

describe("createDisabledTargetProvisioner", () => {
  it("composes the coordinator, reader, dispatcher and workflow with the exact issuer", async () => {
    const reader = { read: vi.fn() };
    const coordinator = { startProvisionAttempt: vi.fn() };
    const dispatcher = { provision: vi.fn() };
    const provisionDisabledAccount = vi.fn(async () => committed);
    vi.mocked(createProvisionReceiptReader).mockReturnValue(reader as never);
    vi.mocked(createProvisionCoordinator).mockReturnValue(coordinator as never);
    vi.mocked(createProvisionDispatcher).mockReturnValue(dispatcher as never);
    vi.mocked(createProvisionWorkflow).mockReturnValue({ provisionDisabledAccount } as never);

    const provisioner = createDisabledTargetProvisioner({
      coordinatorPool: pool(),
      receiptReaderPool: pool(),
      issuer: ISSUER,
      realmId: REALM,
      obtainAccessToken: async () => "token",
      leaseMs: 30_000,
    });
    await expect(
      provisioner.provisionDisabledTarget({ accountId: ACCOUNT, provenance: "test:provision" })
    ).resolves.toEqual({
      accountId: ACCOUNT,
      operationId: OPERATION,
      receiptId: RECEIPT,
      userId: USER,
      issuer: ISSUER,
      replay: false,
    });

    expect(createProvisionReceiptReader).toHaveBeenCalledWith(expect.anything(), {
      issuer: ISSUER,
      realmId: REALM,
    });
    expect(createProvisionCoordinator).toHaveBeenCalledWith(expect.anything(), {
      allowedProvisionIssuers: [ISSUER],
      loadProvisionReceipt: reader,
    });
    expect(createProvisionDispatcher).toHaveBeenCalledWith({
      endpoint: `${ISSUER}/lakeside-provision-transport`,
      issuer: ISSUER,
      realmId: REALM,
      obtainAccessToken: expect.any(Function),
    });
    expect(createProvisionWorkflow).toHaveBeenCalledWith({
      coordinator,
      dispatcher,
      issuer: ISSUER,
      realmId: REALM,
      leaseMs: 30_000,
    });
    expect(provisionDisabledAccount).toHaveBeenCalledWith({
      accountId: ACCOUNT,
      provenance: "test:provision",
    });
  });

  it("fails closed when the workflow is not committed", async () => {
    vi.mocked(createProvisionReceiptReader).mockReturnValue({} as never);
    vi.mocked(createProvisionCoordinator).mockReturnValue({} as never);
    vi.mocked(createProvisionDispatcher).mockReturnValue({} as never);
    vi.mocked(createProvisionWorkflow).mockReturnValue({
      provisionDisabledAccount: async () => ({ ...committed, state: "PENDING" }),
    } as never);
    const provisioner = createDisabledTargetProvisioner({
      coordinatorPool: pool(),
      receiptReaderPool: pool(),
      issuer: ISSUER,
      realmId: REALM,
      obtainAccessToken: async () => "token",
    });
    await expect(
      provisioner.provisionDisabledTarget({ accountId: ACCOUNT, provenance: "test:provision" })
    ).rejects.toMatchObject({ code: "provision_pending" });
  });

  it("rejects unsafe configuration before constructing any component", () => {
    expect(() =>
      createDisabledTargetProvisioner({
        coordinatorPool: pool(),
        receiptReaderPool: pool(),
        issuer: "http://auth.example.invalid/realms/accounts",
        realmId: REALM,
        obtainAccessToken: async () => "token",
      })
    ).toThrow(TypeError);
    expect(createProvisionCoordinator).not.toHaveBeenCalled();
  });
});
