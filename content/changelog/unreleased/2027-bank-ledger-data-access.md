---
date: 2026-11-11
title: "Bank and ledger records get one shared front door"
summary: >-
  Behind the scenes, every read and write of loan, savings, bank movement and
  ledger records now goes through shared modules. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Loans, savings and ledgers behave exactly as before. Their database access now lives in one place per record type, and an automatic check stops new code from reaching around it, which makes money bugs easier to find and prevent.
