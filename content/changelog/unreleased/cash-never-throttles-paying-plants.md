---
date: 2026-11-24
title: "Spending your company's cash to zero no longer slows plants that are making money"
summary: >-
  A plant whose sales cover its wages, site bills and inputs now runs at full
  output even when the company has no cash left, or is overdrawn.
tags: [corporations, production, economy]
badges: [patch]
areas: [engine]
---

Spending your company's cash to zero no longer slows plants that are making
money. If a plant's sales last turn cover what it costs to run (wages, site
bills and inputs at the prices it paid), it runs at full output this turn, even
when the company starts the turn with no cash or with a negative balance. Its
bills are paid from that run's sales before the turn ends.

Before, a plant with a thin margin could lose part of its run, and an overdrawn
company could see a profitable plant produce nothing at all.

Each plant is judged on its own: a profitable plant keeps running at full output
even if another plant in the same company is losing money.

Plants that lose money work as before. They only run as much as the company's
cash can cover, so a company cannot run losing plants on credit. If a plant was
expected to make money but its sales come in short, whatever it could not pay
is owed to its workers and sites as usual, and paid from later turns.

The build warning that tells you how much a build would cut next turn's output
follows the same rule, so it no longer warns about a cut that will not happen.
