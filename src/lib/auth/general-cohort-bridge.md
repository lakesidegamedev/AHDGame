# General AHD web unified bridge

Status: implemented behind an explicit, empty-by-default allowlist. No general
source is enabled in production by this change.

The existing two-account canary still uses `AHD_UNIFIED_COHORT_TARGETS` and its
exact target map. The general bridge adds a second, exact allowlist:

```text
AHD_UNIFIED_GENERAL_COHORT=["<24-hex source Mongo ObjectId>", ...]
```

`AHD_UNIFIED_COHORT_ENABLED=true` still gates the whole path. With the general
list unset or `[]`, the login path is byte-for-byte the canary behavior. An
entry is an exact source account, never an email, username, domain, role or
traffic percentage.

For a listed account, the existing password login runs the full ceremony:

1. verify the source password and security snapshot;
2. create or reuse the canonical account and exact source mapping through the
   authoritative registry (the login route has already verified the password;
   the proof store verifies it again before admission);
3. reserve the canonical account and operation;
4. issue and admit a fresh source proof;
5. claim the lease;
6. provision a disabled Keycloak target through the provision workflow and
   require a committed receipt;
7. write the central fence;
8. write the source Mongo fence, proof consumption and immutable receipt;
9. import and reconcile the retained credential;
10. activate and reconcile the target;
11. issue the unified AHD game session.

The target `userId` comes from the committed provision receipt, not a hardcoded
map. The canonical account comes from the registry reservation.

## Configuration

| Variable                                                   | Purpose                                   |
| ---------------------------------------------------------- | ----------------------------------------- |
| `AHD_UNIFIED_COHORT_ENABLED`                               | Existing master gate; must be `true`      |
| `AHD_UNIFIED_COHORT_TARGETS`                               | Existing exact two-account canary map     |
| `AHD_UNIFIED_GENERAL_COHORT`                               | New exact source allowlist; empty default |
| `LAKESIDE_ENROLLMENT_RUNTIME_PASSWORD`                     | Enrollment/fence/import path              |
| `LAKESIDE_FENCE_READER_PASSWORD`                           | Central fence attestation                 |
| `LAKESIDE_PROVISION_READER_PASSWORD`                       | Issuer provision receipts                 |
| `LAKESIDE_REGISTRY_RUNTIME_PASSWORD`                       | Provision coordinator tables              |
| `LAKESIDE_PROVISION_COORDINATOR_CLIENT_ID` / `_SECRET`     | Provision transport token                 |
| `LAKESIDE_CREDENTIAL_IMPORT_WRITER_CLIENT_ID` / `_SECRET`  | Credential import token                   |
| `LAKESIDE_ACTIVATION_COORDINATOR_CLIENT_ID` / `_SECRET`    | Activation token                          |
| `LAKESIDE_ACTIVATION_RECEIPT_READER_CLIENT_ID` / `_SECRET` | Activation receipt token                  |

The registry-runtime credential used by AHD is the same `lakeside_registry_runtime`
role already used by Ask. It is copied into the AHD identity env; it is not
rotated by this change.

## Safety

A source fence is permanent. Removing an account from the general list does not
unfence it and does not restore legacy login. Recovery is the same-operation
redrive or a database restore plus source reconciliation. Do not add an account
until:

- the provision client token and registry-runtime database access are verified;
- the account has a committed disabled target and supported retained methods;
- the unified game session has been tested for that account class;
- the production-shaped timeout, ambiguous-commit, crash-between-fences and
  replay matrix is green.

The general list is not cohort routing for unmigrated accounts. Every other
account keeps the existing legacy login path.

## Tests

```sh
npx vitest run \
  src/lib/auth/unifiedMigration.test.ts \
  src/lib/auth/unifiedProvisioning.test.ts \
  src/app/api/auth/login/route.test.ts
```

The suite covers the exact canary map, the empty general list, explicit general
entries, malformed/duplicate/oversized lists, safe fallback when the canary map
is malformed, and the login route's existing canary session path.
