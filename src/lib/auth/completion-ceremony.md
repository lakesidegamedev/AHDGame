# Post-admission completion ceremony

Status: isolated orchestration library. No route calls it and no flag is
enabled.

`completeAdmittedMigration(input, dependencies)` is the post-admission half of
the disposable migration ceremony. It starts from an enrollment already
admitted as `eligible` and settles exactly one exact reservation/operation:

1. load the enrollment and reject an operation/account mismatch;
2. claim the lease;
3. provision a disabled target and require a committed receipt;
4. write the central fence;
5. apply the source fence with the fresh admission proof, or redrive the same
   operation with a fresh password proof when the source writer reports stale;
6. import and reconcile the credential, then activate and reconcile the
   target;
7. return only after activation is `unified`.

The library never invents a new operation, target user, account or proof. It
does not query MongoDB, Keycloak or PostgreSQL directly; every external write
is an injected dependency. A pending provision, an uncommitted source fence,
an unknown source-fence commit, a missing password on a stale proof, or a
non-unified activation throws `CompletionError` and never returns success.

`enrolling` and `credentialed` operations are deliberately not guessed. The
caller must use the original lease and durable receipts or run a same-operation
redrive. `unified` is returned idempotently when the enrollment already carries
the target subject.

## Dependency contract

| Dependency                | Required behavior                                  |
| ------------------------- | -------------------------------------------------- |
| `getEnrollment`           | authoritative state, exact operation/account       |
| `claimLease`              | live lease for this authority; no caller token     |
| `provisionDisabledTarget` | committed issuer receipt and real `userId`         |
| `fenceEnrollment`         | central immutable fence under the live lease       |
| `applySourceFence`        | source Mongo fence, one-use consume, receipt       |
| `redriveSourceFence`      | same operation, fresh source proof                 |
| `importAndActivate`       | credential import and target activation reconciled |

The real composition must use the existing enrollment, source fence writer,
credential import and activation adapters. It must not substitute a dispatcher
candidate or an HTTP success for durable evidence.

## Tests

```sh
npx vitest run src/lib/auth/unifiedCompletion.test.ts
```

The eight cases cover the exact order, already-unified replay, enrolling and
credentialed denial, non-committed provisioning, stale-proof redrive, missing
password denial, non-unified activation and operation/account mismatch.

## Remaining wiring

1. Compose the real dependencies from the canary import/activation code.
2. Add a disabled private operator route; do not expose it to a player.
3. Gate the route on the AHD web unified-login path being ready for the exact
   account. A source fence is irreversible; a migrated account that cannot use
   the AHD web unified session would be locked out of the game.
4. Run the production-shaped timeout, ambiguous-commit, crash-between-fences
   and replay matrix before enabling any cohort.
