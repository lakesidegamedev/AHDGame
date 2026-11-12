---
date: 2026-11-07
title: "Tariffs and blockades count in the producer market"
summary: >-
  In new worlds, import tariffs now apply to every cross-border sale in the
  producer market. Buyers see the price including the tariff, and the money
  goes to the importing country's treasury. Existing worlds are unchanged
  until switched on.
tags: [economy, markets, trade]
badges: [patch]
areas: [engine, backend]
---

## What changed

- When a company, household, government or background country buys goods from another country, it now pays that country's import tariff on top of the price. Country-wide, sector and country-targeted tariffs all count, and free trade agreements still remove them.
- Buyers judge an import by its price including the tariff. If that is more than they are willing to pay, they buy at home instead or go without, so raising a tariff really does cut imports.
- The tariff money goes into the importing country's treasury cash each turn. Background countries pay and collect tariffs the same way as everyone else.
- A full naval blockade of either country now stops that trade route, like an embargo already does.
- This is on for newly started worlds. Existing worlds keep their current behaviour until it is switched on.
