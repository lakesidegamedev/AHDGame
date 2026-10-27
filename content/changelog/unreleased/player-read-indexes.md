---
date: 2026-10-27
title: Corporation, trading and bond pages stop scanning the whole database
summary: >-
  Trade history, portfolio charts, supply agreements and bond lists now use
  database indexes instead of reading every record on each page view, and a
  background cleanup that ran every minute no longer reads tens of thousands
  of old payment records each time.
tags: [performance, corporations, market, bonds]
badges: [patch]
areas: [backend]
---

## What changed

- A corporation's trade tape, holders, recent trades and portfolio value
  chart read only that corporation's records.
- Your own trade history and shareholdings, the market volume charts, supply
  agreements and bond lists read only the records they show.
- The cleanup of old payment records, which runs every minute, reads only
  the records it can delete. It was one of the heaviest loads on the game
  database and slowed pages and turns for everyone.
