---
date: 2026-11-21
title: "Company payouts can recover after an interrupted turn"
summary: "An interrupted funded market turn can resume its recorded salaries and dividends once the missing data is restored."
tags: [engineering]
badges: [patch]
areas: [engine]
---

Company payout recovery uses the original salaries and dividends for the turn. Confirmed credits are counted once, and line-of-credit calculations include the earnings at the payout's exchange rate.
