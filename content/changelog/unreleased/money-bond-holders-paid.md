---
date: 2026-11-08
title: "Every bondholder is paid when a defaulted company restructures or closes"
summary: >-
  Index funds, autonomous parties and the public bond market now get their share
  when a company restructures, closes or refinances defaulted bonds. State-owned
  companies pay their own bond interest.
tags: [economy, bonds, fixes]
badges: [patch]
areas: [backend]
---

## What changed

- A defaulted bond restructure now repays index funds, autonomous parties and the public bond market in full, not only players and companies.
- Closing a company over a bond default now pays funds and autonomous parties their recovery share. Bonds a company holds of its own debt cancel out instead of taking a share from other lenders.
- Refinancing defaulted bonds keeps fund and autonomous party holdings in the replacement bond. Before, those units vanished.
- State-owned companies now pay the interest on their bonds from their own treasury. A shortfall shows up as a negative balance, as it already did for repayments at maturity.
