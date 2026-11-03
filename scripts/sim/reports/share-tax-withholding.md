# Share-sale withholding and partial tax collection

Base: `977927913042a799394b5a5753542b59b5df8bf5` (`origin/development`). Issue-first waived by the user.

## Behavior

Personal share-sale proceeds are credited net of tax on realized profit. Cost basis and holding age determine the taxable split: short-term profit uses income-tax rates and long-term profit uses capital-gains rates. National and applicable regional rates, the seller's current income tier and FX terms are frozen when the sale fills. Eligibility follows the receipt assessment turn, including sales by newly created characters due on their first tax turn. Earlier exempt credits remain exempt. Corporate and fund sellers retain their existing taxation.

The atomic wallet credit retains gross proceeds and the reserved tax in a durable receipt. The turn tax phase transfers that reservation to the appropriate treasuries without debiting the wallet again. Existing receipts and in-flight settlement plans retain their original behavior. Withholding applies to market sales, immediate and queued order fills, private offers, agreed acquisitions, hostile buyouts and nationalization payouts, including imperial characters.

Unpaid assessments retain their original amounts. Collections record cumulative national and regional installments. An unaffordable bill can collect available cash, leaving only the remaining liability outstanding. Every installment has distinct, deterministic financial and ledger receipt identities; retrying the same batch cannot charge it twice.

The personal sale modal estimates gross proceeds, withheld tax and net cash as quantity or holding term changes. It warns about outstanding arrears separately. Personal tax statements show paid/withheld amounts, remaining debt and the last collection turn, including old bills paid recently. A reserved sale appears immediately and is not duplicated after treasury delivery. Legacy foreign cost bases are normalized to anchor units consistently with the authoritative holding writer.

## Synthetic replay

`npx tsx scripts/sim/shareTaxWithholding.ts`

432 scenarios passed: US/UK/JP, FX enabled/disabled, three tiers, six gain fractions and four old-debt sizes. Assertions cover conservation, no negative wallets, bounded partial collection and eventual full settlement. Maximum conservation error was `1.1641532182693481e-10` wallet units.

These scenarios use illustrative rates and prices, not live national rates or player records. They qualify settlement mechanics rather than predicting live balances.

`npx tsx scripts/sim/incomeTaxTiers.ts`

The existing 96-turn tax replay passed, including migration, law phase-in, principal exemption, treasury conservation and retries. Its player-tax phase used 36 driver calls at 1, 10 and 100 taxpayers. Synthetic document bytes at those scales were 7,620, 55,815 and 538,485 respectively; the existing fixture driver does not model network latency.

## Incremental read performance

`npx tsx scripts/sim/shareTaxWithholdingPerformance.ts`

The withholding-context load adds six batched reads to an automatic personal-share payout batch, independent of seller count. Previously that stage did not exist and added zero reads. The benchmark explicitly applies requested projections because the in-memory fixture ignores Mongo projection options.

| Sellers | Added calls before | Added calls after | Projected BSON bytes after |
| ------- | ------------------ | ----------------- | -------------------------- |
| 1       | 0                  | 6                 | 494                        |
| 10      | 0                  | 6                 | 1,493                      |
| 100     | 0                  | 6                 | 11,573                     |
| 1,000   | 0                  | 6                 | 113,273                    |

This is an isolated driver-boundary benchmark. A local whole-world Mongo replay was unavailable; no local Mongo world was listening on ports 27017 or 27018. The six additional batched reads do not require raising the corporation-turn budget of 4,500 calls. No query was added inside a seller loop.

## Validation

- Affected tax/trading/buyout suites passed, including US, UK and Japan, regular and imperial owners, FX, installment retries and prepaid treasury delivery.
- Owner-only quote tests cover foreign legacy cost basis, net proceeds, partial arrears and invalid quantities.
- UI regression covers arrears and removal of stale estimates when quantity changes.
- Persistence, reset and turn-read contracts: 178 tests passed.
- Full suite: 6,159 files and 58,116 tests passed; 78 files / 577 tests skipped, one todo.
- Final affected-file rerun after audit fixes: 13 files, 180 tests passed. This includes a delayed old collection resuming after a later installment, changed-rate recovery after net cash credit, new-character eligibility, quote FX and private-sale gross/net responses.
- Strict TypeScript check passed.
- Repository lint passed with zero errors (460 existing warnings); repository-wide formatting passed.
- Portable-rules architecture audit passed with zero blocking findings.
- CI-equivalent production build passed with one static-generation worker. No production database or credentials were used.

No production data was changed and no player data or credentials are included in this report.
