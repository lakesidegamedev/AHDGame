# Source migration routes

Status: implemented, disabled by default. No production route is enabled by
this document.

AHD already has a live two-account canary path in `/api/auth/login`
(`AHD_UNIFIED_COHORT_ENABLED` plus `AHD_UNIFIED_COHORT_TARGETS`). That path
runs the full canary ceremony in one login request and assumes the disabled
Keycloak target was provisioned separately. It remains unchanged.

This slice adds the network transport for the general path. It does not
provision, fence, import, activate or issue a unified session.

## Routes

### `POST /api/auth/migration/source-proof/load`

Private coordinator-to-source proof load. Disabled unless
`AHD_MIGRATION_PROOF_LOAD_ENABLED=true`.

```text
Authorization: Bearer <AHD_MIGRATION_PROOF_LOAD_SECRET>
Content-Type: application/json

{"proofId":"<lowercase UUID v4>"}
```

Returns exactly `{ proof, sourceNowMs, expired }`, or 404 when the proof is
missing. It rejects browser `Origin`/`Cookie`/`Sec-Fetch-Site` headers, accepts
one bearer credential from the 32-512 character token alphabet, and does not
cache. The proof body is durable metadata, never a password or hash.

The coordinator's `createSourceProofHttpLoader` (lakeside-auth PR #52) is the
intended caller.

### `POST /api/auth/migration/start`

User-facing first half. Disabled unless `AHD_MIGRATION_START_ENABLED=true`.

```text
Content-Type: application/json

{"identifier":"username-or-email","password":"...","provenance":"optional"}
```

It resolves the legacy account, verifies fresh password ownership through the
durable source proof store, reserves the exact coordinator identifiers, and
admits the operation. Success is `202` with:

```json
{ "operationId": "<uuid>", "status": "eligible" }
```

It never returns the password, proof body, canonical account ID or a session
cookie. It rejects banned and already fenced accounts before proof issuance.
Failures are generic (`invalid_credentials`, `banned`, `already_migrated`,
`migration_unavailable` or the exact coordinator error code).

The route does **not** make the account usable through the unified issuer.
A separate trusted ceremony must provision a disabled target, obtain the
committed receipt, write the central fence, write the source fence, import the
retained credential, reconcile the activation receipt, and only then mark the
account `unified`.

## Configuration

| Variable                           | Contract                                         |
| ---------------------------------- | ------------------------------------------------ |
| `AHD_MIGRATION_PROOF_LOAD_ENABLED` | Exactly `true` to expose proof load              |
| `AHD_MIGRATION_PROOF_LOAD_SECRET`  | 32-512 token-alphabet characters                 |
| `AHD_MIGRATION_START_ENABLED`      | Exactly `true` to expose the start route         |
| `AHD_MIGRATION_COORDINATOR_URL`    | Exact HTTPS origin, no path/query/fragment       |
| `AHD_MIGRATION_COORDINATOR_SECRET` | 32-512 token-alphabet characters                 |
| `AHD_MIGRATION_SOURCE_ISSUER`      | Defaults to `urn:lakeside:legacy:ahd:production` |

The coordinator URL is the private enrollment-admission service. The
coordinator's proof loader must use the proof-load secret. Both routes are
disabled when their flag is unset or not exactly `true`.

## Tests

```sh
npx vitest run \
  src/lib/auth/migrationCoordinator.test.ts \
  src/lib/auth/migrationStart.test.ts \
  src/app/api/auth/migration/source-proof/load/route.test.ts \
  src/app/api/auth/migration/start/route.test.ts
```

The tests cover exact request/response binding, credential and issuer checks,
banned/fenced denial, proof and coordinator failures, disabled flags, browser
header rejection and route-level error mapping. They use no production
database, issuer or source proof.

## Remaining gates

1. Deploy the coordinator reservation/admission handler from lakeside-auth
   PR #52 with the enrollment runtime role and private TLS ingress.
2. Implement the target provisioning step and derive the Keycloak target
   subject from the committed receipt, not a hardcoded cohort map.
3. Implement the authenticated central-attestation transport for the source
   fence writer and redriver.
4. Run the timeout, ambiguous-commit, crash-between-fences and replay matrix
   against the deployed transport before enabling `AHD_MIGRATION_START_ENABLED`
   for any cohort.
5. Keep the existing two-account canary login path untouched until the general
   ceremony passes that matrix.
