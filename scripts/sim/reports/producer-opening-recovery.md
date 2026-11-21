# Interrupted producer turn recovery verification

This report covers deterministic fixtures and crash-injection tests, not a full-world economic forecast. No production balances or inventories were modified.

## Failure and recovery

The funded host must recover an existing immutable settlement before reading fresh opening generations or issuing funding. A per-turn host snapshot is frozen inside the existing producer receipt's close metadata. It contains rates, wallet scopes, closing-publication inputs and headcounts, without serializing database clients or functions. Existing receipts without that snapshot derive their closing identities from frozen bindings and plans. They never run fresh demand preparation or mint funding on replay.

An empty entrant may use its actual older generation only when the latest settled receipt excluded its sector ID. Capacity, paid basis and inventory must be empty, the two generation stamps must match the current world, and the bounded catch-up window must hold. Existing inventories, prior operating settlements, mismatched generations and sectors included in the receipt remain fail-closed. No generation is rebased. The existing capacity rules deliver outstanding construction and depreciation from the actual opening. Newly paid current-turn orders stay pending.

## Conservation and retry coverage

- Repeated host replay with and without a frozen host snapshot preserves cash, retained input stock, physical capacity and construction.
- Injected crashes before and after sector publication recover the original frozen cash and physical result once.
- A crash after zero-sales publication does not increment the streak twice. Legacy already-published outcomes also keep their streak.
- A fresh funded host freezes its publication inputs; changing the demand builder to throw on retry confirms that it is never called again.
- A synthetic CAD corporation holding 1,000,000,000,000 native units trades with USD wallets at different rates. Repeated recovery preserves the anchor-valued total within 0.001 units.
- An excluded entrant with 1,000 paid construction units delivers its due capacity while closing book value, depreciation and remaining construction sum to exactly the original payment.
- A new 800-unit paid order queued during that catch-up remains undelivered, retaining loan and claim references; total paid basis remains 1,800.
- Historical earnings with a recorded anchor value remain usable after their currency's rate disappears. Payout retries credit the source only once. Unwitnessed earnings without a valid rate still fail before payment.
- Existing preset-currency salary and dividend regression tests run alongside the new recovery tests.

## Cost and lifecycle

Fresh turns move the existing indexed receipt check ahead of demand preparation, without probing it twice. Excluded-entrant reconciliation first filters the already-loaded sector projections and does no receipt read when there are no candidates. Where needed it decodes only the settled receipt's target array and its referenced chunks, rather than the full market graph. Reads and writes stay batched; no new collection or per-sector database query is introduced. The per-receipt zero-sales marker is reset when the next operating receipt replaces producerSettlement, and world reset already removes that parent field.

A full-world turn/round-trip profile was not run in this low-resource pass. The focused accounting, injected-crash and architecture/reset contract checks are the verification evidence; local fixture timing is not presented as multiplayer performance.
