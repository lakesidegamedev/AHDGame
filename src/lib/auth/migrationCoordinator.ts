import { z } from "zod";

/**
 * Authenticated source-server client for the private enrollment coordinator.
 * This is the source side of the proof-backed admission transport:
 *
 *   POST /v1/enrollment/reservation
 *   POST /v1/enrollment/admission
 *
 * It never talks to a browser, never accepts a caller-selected canonical
 * account, and never caches a reservation or admission result. The coordinator
 * owns the registry mapping, proof validation and admission transaction.
 */

const CONTROL = /[\u0000-\u001f\u007f]/u;
const SECRET = /^[A-Za-z0-9._~+/-]+=*$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BASE_URL = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::[0-9]{1,5})?$/u;
const MAX_RESPONSE_BYTES = 8192;

const reservationSchema = z
  .object({
    version: z.literal(1),
    sourceIssuer: z.string().min(1).max(512),
    sourceSubject: z.string().min(1).max(512),
    canonicalAccountId: z.string().regex(UUID_V4),
    enrollmentOperationId: z.string().regex(UUID_V4),
  })
  .strict();

const admissionSchema = z
  .object({
    operationId: z.string().regex(UUID_V4),
    status: z.literal("eligible"),
  })
  .strict();

const errorSchema = z.object({ error: z.string().min(1).max(64) }).passthrough();

export type MigrationReservation = Readonly<z.infer<typeof reservationSchema>>;

export type MigrationCoordinatorConfig = Readonly<{
  baseUrl: string;
  secret: string;
  sourceIssuer: string;
  timeoutMs: number;
}>;

export class MigrationCoordinatorError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number
  ) {
    super("Migration coordinator unavailable");
    this.name = "MigrationCoordinatorError";
  }
}

function requiredText(value: string | undefined, name: string, max: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > max ||
    value.trim() !== value ||
    CONTROL.test(value)
  ) {
    throw new Error(`Invalid migration coordinator configuration: ${name}`);
  }
  return value;
}

function requiredSecret(value: string | undefined): string {
  if (typeof value !== "string" || value.length < 32 || value.length > 512 || !SECRET.test(value)) {
    throw new Error("Invalid migration coordinator configuration: secret");
  }
  return value;
}

function requiredBaseUrl(value: string | undefined): string {
  if (typeof value !== "string" || !BASE_URL.test(value)) {
    throw new Error("Invalid migration coordinator configuration: url");
  }
  return value;
}

export function loadMigrationCoordinatorConfig(
  env: Record<string, string | undefined> = process.env
): MigrationCoordinatorConfig {
  return Object.freeze({
    baseUrl: requiredBaseUrl(env.AHD_MIGRATION_COORDINATOR_URL),
    secret: requiredSecret(env.AHD_MIGRATION_COORDINATOR_SECRET),
    sourceIssuer: requiredText(
      env.AHD_MIGRATION_SOURCE_ISSUER ?? "urn:lakeside:legacy:ahd:production",
      "source issuer",
      512
    ),
    timeoutMs: 5000,
  });
}

const COORDINATOR_ERROR_CODES = new Set([
  "enrollment_request_rejected",
  "enrollment_unauthorized",
  "enrollment_forbidden",
  "enrollment_issuer_not_allowed",
  "enrollment_account_restricted",
  "enrollment_identity_not_mapped",
  "enrollment_not_found",
  "enrollment_proof_not_found",
  "enrollment_conflict",
  "enrollment_paused",
  "enrollment_proof_expired",
  "enrollment_proof_binding_mismatch",
  "enrollment_proof_invalid",
  "enrollment_proof_unavailable",
  "enrollment_rate_limited",
  "enrollment_unavailable",
]);

function parseErrorBody(text: string): { code: string; status: number } {
  try {
    const parsed = errorSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { code: "enrollment_unavailable", status: 503 };
    const code = parsed.data.error;
    if (!COORDINATOR_ERROR_CODES.has(code)) return { code: "enrollment_unavailable", status: 503 };
    const status =
      code === "enrollment_identity_not_mapped" ||
      code === "enrollment_not_found" ||
      code === "enrollment_proof_not_found"
        ? 404
        : code === "enrollment_unauthorized"
          ? 401
          : code === "enrollment_issuer_not_allowed" || code === "enrollment_account_restricted"
            ? 403
            : code === "enrollment_proof_invalid" || code === "enrollment_request_rejected"
              ? 400
              : code === "enrollment_conflict" ||
                  code === "enrollment_paused" ||
                  code === "enrollment_proof_expired" ||
                  code === "enrollment_proof_binding_mismatch"
                ? 409
                : 503;
    return { code, status };
  } catch {
    return { code: "enrollment_unavailable", status: 503 };
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new MigrationCoordinatorError("enrollment_unavailable", 503);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        throw new MigrationCoordinatorError("enrollment_unavailable", 503);
      }
      chunks.push(value);
    }
  } finally {
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
      // Best effort.
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createMigrationCoordinatorClient(
  config: MigrationCoordinatorConfig,
  fetcher: typeof fetch = fetch
) {
  if (
    !config ||
    typeof config.baseUrl !== "string" ||
    typeof config.secret !== "string" ||
    typeof config.sourceIssuer !== "string" ||
    !Number.isInteger(config.timeoutMs) ||
    config.timeoutMs < 10 ||
    config.timeoutMs > 5000
  ) {
    throw new TypeError("Invalid migration coordinator client configuration");
  }
  if (typeof fetcher !== "function") throw new TypeError("Invalid migration coordinator fetcher");

  async function post(path: string, body: object): Promise<Response> {
    let response: Response;
    try {
      response = await fetcher(`${config.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.secret}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch {
      throw new MigrationCoordinatorError("enrollment_unavailable", 503);
    }
    return response;
  }

  async function reserve(input: {
    subject: string;
    provenance: string;
  }): Promise<MigrationReservation> {
    const response = await post("/v1/enrollment/reservation", {
      issuer: config.sourceIssuer,
      subject: input.subject,
      provenance: input.provenance,
    });
    const text = await readBoundedText(response);
    if (response.status !== 200) {
      const parsed = parseErrorBody(text);
      throw new MigrationCoordinatorError(parsed.code, parsed.status);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new MigrationCoordinatorError("enrollment_unavailable", 503);
    }
    const reservation = reservationSchema.safeParse(parsed);
    if (
      !reservation.success ||
      reservation.data.sourceIssuer !== config.sourceIssuer ||
      reservation.data.sourceSubject !== input.subject
    ) {
      throw new MigrationCoordinatorError("enrollment_unavailable", 503);
    }
    return Object.freeze(reservation.data);
  }

  async function admit(input: {
    reservation: MigrationReservation;
    proofId: string;
    sourceAccountId: string;
    idempotencyKey: string;
    provenance: string;
  }): Promise<Readonly<{ operationId: string; status: "eligible" }>> {
    if (
      input.reservation.sourceIssuer !== config.sourceIssuer ||
      !UUID_V4.test(input.proofId) ||
      !/^[0-9a-f]{24}$/u.test(input.sourceAccountId) ||
      input.reservation.sourceSubject !== input.sourceAccountId
    ) {
      throw new MigrationCoordinatorError("enrollment_request_rejected", 400);
    }
    const response = await post("/v1/enrollment/admission", {
      reservation: input.reservation,
      proofId: input.proofId,
      sourceAccountId: input.sourceAccountId,
      idempotencyKey: input.idempotencyKey,
      provenance: input.provenance,
    });
    const text = await readBoundedText(response);
    if (response.status !== 200) {
      const parsed = parseErrorBody(text);
      throw new MigrationCoordinatorError(parsed.code, parsed.status);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new MigrationCoordinatorError("enrollment_unavailable", 503);
    }
    const admitted = admissionSchema.safeParse(parsed);
    if (
      !admitted.success ||
      admitted.data.operationId !== input.reservation.enrollmentOperationId
    ) {
      throw new MigrationCoordinatorError("enrollment_unavailable", 503);
    }
    return Object.freeze(admitted.data);
  }

  return Object.freeze({ reserve, admit });
}

export type MigrationCoordinatorClient = ReturnType<typeof createMigrationCoordinatorClient>;
