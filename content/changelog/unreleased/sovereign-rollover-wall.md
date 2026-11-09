---
date: 2026-11-04
title: "Refinanced government bonds no longer pile up into one giant maturity"
summary: >-
  When a government cannot repay a maturing bond in cash, the replacement
  paper it issues can now go into one bond per country and interest rate for
  that turn, not one new bond for every bond that matured. The debt, the
  interest and every holder's position stay the same. The setting starts off.
tags: [bonds, sovereign-debt, performance]
badges: [patch]
areas: [engine]
---

## What changed

- When a government bond matures and the Treasury is short of cash, up to three things can refinance it: the bond market swaps part of its holding for new paper, the rest of its holding is rolled into new paper, and the government sells a new bond to raise the cash it owes everyone else. Each of these used to create its own new 48-turn bond for every bond that matured, so a turn with 9,460 maturities issued 25,976 new bonds, all due on the same later turn.
- That pattern repeated and grew every 48 turns: 1,679 bonds, then 3,597, then 9,460, then 25,976. Each bond costs work every turn for interest and several settlement steps when it matures, so the turn where they all came due took 53 minutes instead of about 8.
- With the new `sovereignRolloverConsolidationEnabled` stage switched on, all three refinancing paths add their new paper to one shared bond per country, currency, interest rate, term and turn. The face value, the interest the government pays, the cash raised and paid out, and the holdings are identical to before. Only the number of bond documents changes.
- A one-time cleanup (`AHD-sovereign-rollover-wall`) folds bonds already split this way into one bond per series, keeping each holder's position, so the next maturity wall shrinks from about 26,000 bonds to about 300. Its dry run is `scripts/ops/sovereignRolloverWallDryRun.ts`.
- The stage defaults to off. With it off, refinancing behaves exactly as before.
