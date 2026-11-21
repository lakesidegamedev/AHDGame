# Regional deficit financing verification

This is a deterministic rules-level accounting simulation, not a whole-world growth forecast.
Run `npx tsx scripts/sim/regionalDebtFinancing.ts` from this branch.

## Rules

- Existing cash covers spending before new borrowing. Regional money stays in its country currency.
- Interest is 5% annually on opening principal, charged once per actual turn, using the shared 48-turn fiscal year.
- Borrowing covers only the cash shortfall. Surpluses repay principal; residual cash is retained.
- Debt approval pressure is minus 10 times debt/GDP, capped at 25 points. It is a current-stock modifier, not a repeated approval deduction.
- Existing negative state cash becomes a liability once. No historical debt is invented for regional budgets that never recorded an accumulated balance.
- Regional law demand is booked in the enactment transaction. Settlements publish funded annual authority; they do not claim that an entire year's cash was paid in one turn.

## Fixed-input trajectories

All figures below are local currency. The equal USD/CAD inputs deliberately produce equal local results without an FX conversion.

| Scenario                                             | Turn |      Principal |           Cash | Cumulative interest | Approval penalty |
| ---------------------------------------------------- | ---: | -------------: | -------------: | ------------------: | ---------------: |
| USD/CAD: annual revenue 1B, spending 1.1B, GDP 5B    |   48 | 102,487,478.10 |              0 |        2,487,477.78 |             -0.2 |
| Same inputs                                          |   96 | 210,226,797.75 |              0 |       10,226,797.11 |             -0.4 |
| Opening negative cash 50M, revenue 1.1B, spending 1B |   48 |              0 |  49,337,781.10 |          662,219.22 |                0 |
| Same recovery inputs                                 |   96 |              0 | 149,337,781.42 |          662,219.22 |                0 |

Every step asserts opening net assets plus revenue less primary outlays and interest equals closing cash less principal. Retrying every step returns the same ledger.

## Live evidence

Read-only totals at turn 88 on 2026-11-20: 64 US/Canadian state budget rows, two in annual deficit and two with negative accumulated cash. Texas had annual revenue 417.468B, spending 395.922B and cash 21.545B. No live data was changed. These totals establish existing cash must be preserved, not replaced by an annual deficit number.

## Performance and lifecycle

The new settlement phase loads the country tier registry once, reads two projected budget collections, and uses at most two bulk writes: five Mongo commands before pagination, independent of the number of regions. A 102-region fixture checks one read and one write per collection. Approval uses two projected budget reads per country, with no per-region query.

Debt and cash live inside the existing world budget documents. State budgets are replaced by the budget seed; regional budgets are a runtime collection dropped on reset. No new production collection, index, or GameState field is introduced.

## Verification

- 205 focused and regression tests passed across debt rules, settlement, annual repricing, approval, budget API/UI, regional processors and enactment.
- 269 reset, seed, lifecycle and turn-read contract tests passed (`npm run architecture:contracts`).
- Changed-source/import-graph TypeScript check passed with a 4 GiB heap cap. The full repository typecheck exceeded 4 GiB and 6 GiB local heap limits; it is not claimed as passing.
- Touched-file ESLint passed without warnings. Formatting and whitespace checks passed.
- Architecture audit: zero blocking findings; two existing oversized-file warnings outside this change.
- No production data was written. A production build and the repository-wide test suite were not run locally.

Audit regression: a concurrent revenue or spending-authority edit invalidates the state financing write; retry uses the new inputs and makes no stale borrowing entry.
