---
date: 2026-11-07
title: "Background country pages and organisation votes"
summary: >-
  In a 2027 world each background country now has its own overview page, and
  background countries vote on the business of the organisations they belong
  to. Other start dates and existing worlds are unchanged.
tags: [world, countries, diplomacy, organisations]
badges: [patch]
areas: [frontend, engine, backend]
---

## What changed

- Opening a background country in a 2027 world shows one overview page: its economy (GDP, growth, inflation, unemployment, debt and credit rating), its currency chart, its trade with the United States and the tariffs each side charges, its government and seat chart with the next election date once national politics are running, the government bonds and national index you can buy, and its alliances and active crises.
- Background countries have no regions, legislature or politicians to play, so links to those pages now take you to the country's overview instead of an empty page. Its currency market still works as before.
- Background countries now vote on sanctions, trade agreements, statements, aid, dues, posture, agency funding and chair elections in the organisations they belong to. Each vote follows the country's bloc alignment, its government's economic stance, what the measure would cost its economy and how the rest of the bloc has voted. A country never votes to sanction or condemn itself.
- Admissions, war declarations and joining a war are still decided by player countries only.
- Worlds started from any other date, and the live world, behave exactly as before.
