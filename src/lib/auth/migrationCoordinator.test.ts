import { describe, expect, it, vi } from "vitest";
import {
  MigrationCoordinatorError,
  createMigrationCoordinatorClient,
  loadMigrationCoordinatorConfig,
} from "./migrationCoordinator";

const SOURCE_ISSUER = "urn:lakeside:legacy:ahd:production";
const SECRET = "A".repeat(32);
const RESERVATION = {
  version: 1 as const,
  sourceIssuer: SOURCE_ISSUER,
  sourceSubject: "6a1082556b36a0ff66ae250c",
  canonicalAccountId: "12e2ef3f-ba11-4c7a-b7d7-9655b11bf415",
  enrollmentOperationId: "7a922964-86e8-4239-a684-6bf337a6f7ba",
};
const OPERATION = RESERVATION.enrollmentOperationId;
const PROOF = "4709b2a0-7140-4de2-a8d8-f7ec585d315e";

function config() {
  return {
    baseUrl: "https://coordinator.example.invalid",
    secret: SECRET,
    sourceIssuer: SOURCE_ISSUER,
    timeoutMs: 1000,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("migration coordinator configuration", () => {
  it("requires an exact HTTPS base, a strong secret and a bounded timeout", () => {
    expect(
      loadMigrationCoordinatorConfig({
        AHD_MIGRATION_COORDINATOR_URL: "https://coordinator.example.invalid",
        AHD_MIGRATION_COORDINATOR_SECRET: SECRET,
        AHD_MIGRATION_SOURCE_ISSUER: SOURCE_ISSUER,
      })
    ).toEqual({
      baseUrl: "https://coordinator.example.invalid",
      secret: SECRET,
      sourceIssuer: SOURCE_ISSUER,
      timeoutMs: 5000,
    });
    expect(() => loadMigrationCoordinatorConfig({})).toThrow();
    expect(() =>
      loadMigrationCoordinatorConfig({
        AHD_MIGRATION_COORDINATOR_URL: "http://coordinator.example.invalid",
        AHD_MIGRATION_COORDINATOR_SECRET: SECRET,
      })
    ).toThrow();
    expect(() =>
      loadMigrationCoordinatorConfig({
        AHD_MIGRATION_COORDINATOR_URL: "https://coordinator.example.invalid/path",
        AHD_MIGRATION_COORDINATOR_SECRET: SECRET,
      })
    ).toThrow();
    expect(() =>
      loadMigrationCoordinatorConfig({
        AHD_MIGRATION_COORDINATOR_URL: "https://coordinator.example.invalid",
        AHD_MIGRATION_COORDINATOR_SECRET: "short",
      })
    ).toThrow();
  });
});

describe("migration coordinator client", () => {
  it("reserves with the exact issuer, subject and bearer credential", async () => {
    const fetcher = vi.fn(async () => json(RESERVATION));
    const client = createMigrationCoordinatorClient(config(), fetcher);
    const result = await client.reserve({
      subject: RESERVATION.sourceSubject,
      provenance: "source-login",
    });
    expect(result).toEqual(RESERVATION);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(url).toBe("https://coordinator.example.invalid/v1/enrollment/reservation");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: expect.objectContaining({
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      }),
    });
    expect(JSON.parse(init.body as string)).toEqual({
      issuer: SOURCE_ISSUER,
      subject: RESERVATION.sourceSubject,
      provenance: "source-login",
    });
  });

  it("admits the exact reservation and proof with a stable idempotency key", async () => {
    const fetcher = vi.fn(async () => json({ operationId: OPERATION, status: "eligible" }));
    const client = createMigrationCoordinatorClient(config(), fetcher);
    const result = await client.admit({
      reservation: RESERVATION,
      proofId: PROOF,
      sourceAccountId: RESERVATION.sourceSubject,
      idempotencyKey: "B".repeat(43),
      provenance: "source-fence",
    });
    expect(result).toEqual({ operationId: OPERATION, status: "eligible" });
    const [url, init] = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(url).toBe("https://coordinator.example.invalid/v1/enrollment/admission");
    expect(JSON.parse(init.body as string)).toEqual({
      reservation: RESERVATION,
      proofId: PROOF,
      sourceAccountId: RESERVATION.sourceSubject,
      idempotencyKey: "B".repeat(43),
      provenance: "source-fence",
    });
  });

  it("maps stable coordinator errors and never leaks the response body", async () => {
    for (const [status, code, expectedStatus] of [
      [404, "enrollment_identity_not_mapped", 404],
      [403, "enrollment_account_restricted", 403],
      [409, "enrollment_proof_expired", 409],
      [400, "enrollment_proof_invalid", 400],
      [503, "enrollment_proof_unavailable", 503],
      [503, "not_a_valid_code", 503],
    ] as const) {
      const fetcher = vi.fn(async () => json({ error: code }, status));
      const client = createMigrationCoordinatorClient(config(), fetcher);
      await expect(
        client.reserve({ subject: RESERVATION.sourceSubject, provenance: "x" })
      ).rejects.toMatchObject({
        name: "MigrationCoordinatorError",
        code:
          expectedStatus === 503
            ? code === "not_a_valid_code"
              ? "enrollment_unavailable"
              : code
            : code,
        status: expectedStatus,
      });
    }
  });

  it("rejects malformed, mismatched and oversized responses", async () => {
    for (const body of [
      {},
      { ...RESERVATION, version: 2 },
      { ...RESERVATION, sourceIssuer: "https://other.example.invalid" },
      { ...RESERVATION, sourceSubject: "other" },
    ]) {
      const client = createMigrationCoordinatorClient(
        config(),
        vi.fn(async () => json(body))
      );
      await expect(
        client.reserve({ subject: RESERVATION.sourceSubject, provenance: "x" })
      ).rejects.toBeInstanceOf(MigrationCoordinatorError);
    }

    const oversized = new Response("x".repeat(9000), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const client = createMigrationCoordinatorClient(
      config(),
      vi.fn(async () => oversized)
    );
    await expect(
      client.reserve({ subject: RESERVATION.sourceSubject, provenance: "x" })
    ).rejects.toMatchObject({ status: 503 });
  });

  it("rejects an admission result for a different operation", async () => {
    const client = createMigrationCoordinatorClient(
      config(),
      vi.fn(async () =>
        json({
          operationId: "8209dad5-7634-4087-9d74-64341fecd699",
          status: "eligible",
        })
      )
    );
    await expect(
      client.admit({
        reservation: RESERVATION,
        proofId: PROOF,
        sourceAccountId: RESERVATION.sourceSubject,
        idempotencyKey: "B".repeat(43),
        provenance: "x",
      })
    ).rejects.toMatchObject({ status: 503 });
  });

  it("maps transport failures to unavailable", async () => {
    const client = createMigrationCoordinatorClient(
      config(),
      vi.fn(async () => {
        throw new TypeError("network down");
      })
    );
    await expect(
      client.reserve({ subject: RESERVATION.sourceSubject, provenance: "x" })
    ).rejects.toMatchObject({ code: "enrollment_unavailable", status: 503 });
  });
});
