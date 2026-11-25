---
date: 2026-11-25
title: "Company and sector pages load again for owners with sites in euro countries"
summary: >-
  Sector pages, the sector list, regional markets and product development failed
  to load for companies that own a site in a euro country. They load again.
tags: [corporations, currency]
badges: [patch]
areas: [backend]
---

Companies that own a site in a euro country could not open any of their sector
pages, and the sector list, the regional market view and product development
showed an error instead of figures. These screens read only live exchange rates,
and those sites are kept in the host country's original currency, which has no
live quote. They now use the same rates as the turn, so every figure lines up
with the rest of the game and the pages load again.
