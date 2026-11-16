# Funded nationalization verification

Synthetic fixtures only. No live balances, player data or configured database were read or changed.

Run: `npx tsx scripts/sim/natcorp-funded-ownership.ts`

| Scenario               | Turns | Ownership changes | Delivered units | Opening and closing cash | Remaining bills |
| ---------------------- | ----: | ----------------: | --------------: | -----------------------: | --------------: |
| 10,000 per account     |    48 |                 4 |           1,200 |                   50,000 |               0 |
| 1 trillion per account |    48 |                 4 |           1,200 |               5 trillion |               0 |

The real portable producer-market engine runs every turn with different operating costs for two distinct sites. Ownership changes before the first funded turn and on turns 12, 24 and 36 conserve stock units and book value; creditor novation and retry preserve the invoice total. Cash is checked after every settlement. This is a focused production and ownership simulation, not a full-world macroeconomic forecast.

Complementary isolated replica-set tests exercise the actual site transfer and index migration: full taking into a region already hosting a different production method, partial private carve, unchanged mixed-currency balances, transaction rollback on failed creditor writes, and repeat calls. Separate cash-consolidation coverage checks CAD-to-USD residual cash and retry. Pure tests cover large inventory books, mixed-world rejection, stale receipts, first funded receipts, loss-making remittances and zero-capacity stocks.

Performance: one serial test worker, 2 GiB test heap, 3 GiB scoped typecheck. Mandate competition reads are one projected batch per pass, including only the inventory generation marker rather than the stock arrays. Distress reads its configured credit runway once per batch. Ownership replay checks reuse the sector-wide batch, with no additional per-site query. Transactions are confined to ownership events rather than the ordinary production loop. No full-world turn benchmark was run for this isolated ownership fixture.

The post-refactor engine was compared with the branch's original producer engine using the same synthetic 48-turn fixtures. Every serialized per-turn settlement matched, including account balances, receipts, orders, inventories and payables. SHA-256 digests: `5f3cf370a8cb7945454a6b6d76281446f604f53175344825e5568772e42b45ee` (10,000/account), `60e81ae901572507f5f4d566c3a2f01c92ac227fd2553b82540230624c195b1c` (1 trillion/account).

The follow-up fixtures cover held-share and bond portfolios, mixed-currency historical basis, effective super-voting rights, arrears by currency and creditor jurisdiction, a failing later bond write rolling back an earlier share move, and replay. Combining unknown and recorded basis, or transferring an in-flight bond trade, refuses before compensation rather than inventing a basis or losing an outstanding trade.

Repository cleanup extracts 104 oversized route workflows, splits oversized modules and renderers, and removes layering violations. All 158 extracted HTTP handler implementations have structurally identical ASTs to the originals; route configuration remains in literal exports on each route. Four changed Mongo-loop fingerprints were matched to the same original operations and arguments at their new locations. Dynamic-collection records retain their original owning-function hashes. No architecture threshold or total legacy allowance was raised; all 17 remaining size pins were removed by the lower-only command after the modules fell below the size threshold.

A native Mongo read-profile fixture (two public and 30 private synthetic sites, each with 500 input and 500 output lots) measured the changed SOE reporting pass. The original pass used 6 round trips and decoded 134,221 BSON bytes across 7 returned documents. The revised pass used 7 round trips and decoded 6,951 bytes across 39 documents, a 94.8% reduction in read bytes. The additional query is the projected competition batch; stock arrays are excluded from reporting reads. This isolates the reporting reads with capex disabled, not a full-world turn benchmark.

Final local verification: 686 focused tests passed (30 opt-in tests skipped), all 269 architecture/reset contracts passed, and all 19 native launcher tests passed. Earlier owned replica-set verification passed all eight physical-transfer/holdings tests. Changed-code TypeScript roots passed in six serial partitions, with the NatCorp scope checked separately. Lint reported zero errors and zero warnings across 450 changed code files. The architecture audit reported zero blocking findings and zero warnings.

The optimized Next production build completed successfully with one build worker and a 4 GiB V8 heap limit. Because dependencies are shared through a local worktree junction, this run temporarily widened Turbopack's root to include that junction target; the configuration was restored afterward and is not part of the change. The build's normal TypeScript-skip setting is unchanged. Full-project typechecking and the full test suite are delegated to CI at the user's request; no full local suite pass is claimed.
