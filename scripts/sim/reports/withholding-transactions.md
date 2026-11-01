# Withholding transaction simulation matrix

Synthetic fixtures only. No production accounts, player data or live database writes.

## Result

585 cases passed. Each of 39 transaction or payment-guard types has five scenarios in each of US, UK and Japan: 15 cases per type. The suite also executes 315 monetary replay checks, 63 injected rollback/retry cases and 60 additional arrears-recovery settlements across later turns.

| Group                                               | Types | Cases |
| --------------------------------------------------- | ----: | ----: |
| Personal income, principal and interest             |    12 |   180 |
| Corporate income, losses, distributions and arrears |     6 |    90 |
| Discretionary and statutory payment guards          |    18 |   270 |
| Linked corporate-to-personal payment chains         |     3 |    45 |
| Total                                               |    39 |   585 |

## Income scenarios

Every income type is exercised with no arrears, small arrears, arrears larger than available income, a zero current tax rate, and foreign-currency income interrupted after a recovery-receipt write. Ordinary income uses synthetic 20% national plus 10% regional tax; capital-classified dividends use 15% plus 5%. Existing debt is separate from current withholding.

The assertions inspect actual wallet balances, Treasury cash, regional receipts, debt counters, bank reserve assets and deposit liabilities, authoritative savings records, pending interest, corporate held cash, household accounts, recovery receipts and balanced ledger legs. Replays must not change money-affecting state. Financial transaction reporting is outside the source monetary-receipt digest.

### Ordinary US examples without arrears

Amounts are normalized anchor units, not live prices or rates. Savings payouts below are increments above existing principal.

| Income type                         | Gross | Current tax | Arrears paid | Net increment |
| ----------------------------------- | ----: | ----------: | -----------: | ------------: |
| CEO salary                          |   100 |          30 |            0 |            70 |
| corporation dividend                |   100 |          30 |            0 |            70 |
| already-taxed pass-through dividend |   100 |           0 |            0 |           100 |
| capital-gains dividend              |   100 |          20 |            0 |            80 |
| index-fund dividend                 |   100 |          30 |            0 |            70 |
| bond coupon                         |   100 |          30 |            0 |            70 |
| bond principal                      |   100 |           0 |            0 |           100 |
| bond coupon plus principal          |  1100 |          30 |            0 |          1070 |
| central-bank authoritative interest |   100 |          30 |            0 |            70 |
| central-bank legacy interest        |   100 |          30 |            0 |            70 |
| private-bank authoritative interest |   100 |          30 |            0 |            70 |
| private-bank legacy interest        |   100 |          30 |            0 |            70 |

The partial-arrears scenario confirms current tax is reserved first and only the residual repays old debt. Bond principal is protected from both income tax and income-arrears collection. Already-taxed pass-through distributions are not taxed again, but their eligible cash can repay existing debt. Authoritative bank interest reduces backing cash by diverted tax and arrears and increases the deposit liability only by net interest. Central-bank accrued interest clears its pending record while principal remains intact.

## Linked flow checks

Five cases per country also follow the entire modeled cash chain:

- Operating receipts to corporate tax and CEO salary, followed by personal withholding and arrears.
- Operating receipts to corporate tax and shareholder dividends, followed by personal withholding and arrears.
- Operating receipts through a corporate shareholder, including dividend-received tax, and then a personal dividend with personal withholding and arrears.

For example, 200 anchor operating receipts in the salary chain reconcile to 80 retained corporate cash, 20 corporate tax, 30 personal tax and 70 net salary. The corporate-holder chain reconciles to 90 retained corporate cash across both corporations, 60 corporate taxes, 15 personal tax and 35 personal cash. Foreign-currency and zero-rate versions use the same conservation checks. An interrupted downstream personal payment can resume without charging the already-settled corporation twice.

## Payment guards

Each guard type is exercised with clear funds, unpaid tax, unpaid operating debt, held receipts awaiting withholding, and insufficient spendable cash. Shared atomic debit helpers or the exact production cash-eligibility predicate are used. Statutory fines and pensions may pay despite old payables, but cannot debit insufficient cash. The outflow tests cover corporate funding and debit eligibility, not each HTTP route's authentication or the separate taxation of an asset-sale recipient.

### Existing legacy exception

The legacy floored issuer-buyback path intentionally permits an overdraft when there are no existing tax/operating arrears or held receipts. With 1 available and a 20 buyback, it pays 20 and leaves corporate liquid cash at -19. Capped buybacks reject that transaction. Both paths reject known unpaid tax, operating debt and held receipts. This is existing stage-dependent behavior, not a newly introduced tax exemption or money-conservation failure; negative cash is retained in the accounting. The simulation did not inspect the live world's selected stage.

## Reproduce and scope

Run sequentially with one worker:

```powershell
$env:AHD_TAX_SIM_REPORT = '<temporary output path>.json'
node node_modules/vitest/vitest.mjs run scripts/sim/withholdingTransactions.test.ts --maxWorkers=1
```

This calls the production personal/corporate settlement services and shared outflow guards using a stateful in-memory database. Gross producer funding is seeded or prepared; it does not replay every upstream order, route, authorization or calculation. Required-transaction behavior is represented by a snapshot/rollback harness. It is not a native Mongo transaction, concurrent-user test or full-world economic replay. Existing producer/turn regression suites provide separate wiring coverage. No production behavior was changed for this simulation request.

Full numeric results are in `withholding-transactions.json`.

## Per-type coverage

| Transaction or guard type                        | Cases |
| ------------------------------------------------ | ----: |
| CEO salary                                       |    15 |
| corporation dividend                             |    15 |
| already-taxed pass-through dividend              |    15 |
| capital-gains dividend                           |    15 |
| index-fund dividend                              |    15 |
| bond coupon                                      |    15 |
| bond principal                                   |    15 |
| bond coupon plus principal                       |    15 |
| central-bank authoritative interest              |    15 |
| central-bank legacy interest                     |    15 |
| private-bank authoritative interest              |    15 |
| private-bank legacy interest                     |    15 |
| modeled operating earnings                       |    15 |
| funded operating receipts                        |    15 |
| corporate dividend receipt                       |    15 |
| AI household distribution                        |    15 |
| operating loss                                   |    15 |
| corporate arrears recovery                       |    15 |
| share purchase                                   |    15 |
| bond purchase                                    |    15 |
| fund subscription                                |    15 |
| subsidiary capital injection                     |    15 |
| spin-off funding                                 |    15 |
| sector expansion                                 |    15 |
| plant construction                               |    15 |
| strategy retool                                  |    15 |
| strategy cancellation                            |    15 |
| headquarters relocation                          |    15 |
| acquisition                                      |    15 |
| corporate rename                                 |    15 |
| tech unlock                                      |    15 |
| union action                                     |    15 |
| parent bond subsidy                              |    15 |
| issuer capped buyback                            |    15 |
| issuer legacy floored buyback                    |    15 |
| statutory fine or pension                        |    15 |
| earnings to CEO salary                           |    15 |
| earnings to shareholder dividend                 |    15 |
| earnings through corporate holder to shareholder |    15 |
