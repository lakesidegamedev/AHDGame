---
date: 2026-11-07
title: "The 2027 world splits countries into player, NPP-run and background tiers"
summary: >-
  In a new 2027 world, the United States is the player country, the United
  Kingdom, Germany, Japan and China run in full under NPPs, and sixteen other
  countries become background countries that skip the full simulation. Other
  start dates and existing worlds are unchanged.
tags: [world, countries, performance]
badges: [patch]
areas: [engine, backend]
---

## What changed

- A 2027 world now starts with the United States as the only country players can join.
- The United Kingdom, Germany, Japan and China run the full simulation, run by NPPs. Each can be opened to players later without a reset.
- Ireland, Brazil, Nigeria, Russia, Poland, Hungary, Romania, Bulgaria, France, Italy, Spain, Sweden, Turkey, Austria, Finland and Greece are background countries. They keep their country page data, currency and exchange rate, but start with no companies, sectors, unions, NPP politicians or elections, and the hourly turn skips their elections, bills, governments, crises, disasters, world events and regional budgets.
- This should make each 2027 turn much faster. Background countries do not yet buy or sell in the markets; their trade, elections, budgets and bonds arrive in later updates.
- Worlds started from any other date, and the live world, behave exactly as before.
