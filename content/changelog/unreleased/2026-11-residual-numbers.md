---
date: 2026-11-22
title: "Commodity cover, bond sizes and the status bar dividend figure now match"
summary: >-
  Commodity cover is labelled in days, the bond issue slider moves in whole bond
  units, and the desktop status bar shows the dividends you were actually paid.
tags: [corporations, bonds, commodities]
badges: [patch]
areas: [engine]
---

## What changed

- The Cover column on a company's Commodities tab is now labelled in days of demand. It was labelled in turns, but the market ledger measures demand per day.
- The bond issue slider now steps in whole bond units, each worth 1,000 in the bond's own currency, the same unit holdings use. It used to step in 1,000 of the shared base currency, which left odd leftovers for currencies worth more or less.
- The dividend figure in the desktop and mobile status bar now shows the dividends actually credited on your latest payout turn, the same number as the profile page.
- The Finance tab's "Other movements, not itemised" note no longer says payouts settle a turn later. Dividends leave company cash in the same turn they are recorded.
