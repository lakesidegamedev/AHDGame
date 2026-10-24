# Disabled target provisioning ceremony

Status: composed helper, not called by a route and not enabled. The existing
two-account canary login path is unchanged.

`createDisabledTargetProvisioner` composes the already-tested account-registry
pieces:

- `createProvisionCoordinator` over the enrollment coordinator pool;
- `createProvisionReceiptReader` over the issuer provision receipt database
  (`lakeside_provision_receipt_reader`, `LAKESIDE_PROVISION_READER_PASSWORD`);
- `createProvisionDispatcher` pointed at the issuer
  `lakeside-provision-transport` endpoint;
- `createProvisionWorkflow` with the exact issuer, realm and 30-60 second lease.

`provisionDisabledTarget({ accountId, provenance })` returns only a committed
receipt binding: `{ accountId, operationId, receiptId, userId, issuer,
replay }`. A pending, aborted, mismatched or malformed result throws
`ProvisioningCeremonyError` and never authorizes a fence, import or activation.

The returned `userId` is the real Keycloak target subject from the committed
issuer receipt. It replaces the hardcoded two-account target map in the general
path. Email, username and caller-selected user IDs never establish it.

## Required configuration

| Variable                                        | Purpose                                        |
| ----------------------------------------------- | ---------------------------------------------- |
| `UNIFIED_OIDC_ISSUER`                           | Exact issuer URL, no trailing slash            |
| `UNIFIED_OIDC_REALM_ID`                         | Exact target realm                             |
| `LAKESIDE_IDENTITY_DB_HOST` / `PORT` / `CA_B64` | Coordinator and receipt database transport     |
| `LAKESIDE_ENROLLMENT_RUNTIME_PASSWORD`          | Coordinator provision tables                   |
| `LAKESIDE_PROVISION_READER_PASSWORD`            | Issuer provision receipt reader                |
| `LAKESIDE_PROVISION_COORDINATOR_CLIENT_ID`      | New service client for the provision transport |
| `LAKESIDE_PROVISION_COORDINATOR_CLIENT_SECRET`  | Matching service-client secret                 |

The provision coordinator service client is not currently configured in the
AHD production environment. Do not enable a general ceremony until it is
created, scoped to the exact issuer, and injected through the deployment secret
store.

## What this is not

This helper does not start enrollment, claim a lease, write the central fence,
write the source MongoDB fence, consume a proof, import a credential, activate
a target, issue a session or change a cohort flag. It does not retry a provider
mutation; the workflow reconciles durable coordinator evidence exactly once.

## Tests

```sh
npx vitest run src/lib/auth/unifiedProvisioning.test.ts
```

The tests cover exact composition, the committed result projection, pending and
aborted denial, malformed receipt fields, mismatched issuer and unsafe
configuration.

## Remaining ceremony steps

1. Wire the helper into the general migration ceremony after the exact
   reservation and proof-backed admission.
2. Write the central fence only after this helper returns `COMMITTED`.
3. Run the source fence writer with the committed target subject and a fresh
   proof; then bind and reconcile the credential import.
4. Reconcile target activation and only then mark the account `unified`.
5. Exercise timeout, ambiguous commit, crash-between-fences and replay against
   the deployed transport before enabling a cohort.
