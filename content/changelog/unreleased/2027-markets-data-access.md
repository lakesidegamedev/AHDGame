---
date: 2026-11-11
title: "Fund, order, budget and exchange rate records get shared front doors"
summary: >-
  Behind the scenes, every read and write of index fund, share order, currency
  order, state budget, imperial character and exchange rate records now goes
  through shared modules. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Markets, funds and budgets behave exactly as before. Their database access now lives in one place per record type, and an automatic check stops new code from reaching around it, which makes money bugs easier to find and prevent.
