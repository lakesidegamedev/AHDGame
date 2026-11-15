---
date: 2026-11-11
title: "The remaining game records get shared front doors"
summary: >-
  Behind the scenes, reads and writes of achievements, news, mail, party
  records, roadmap items, API keys and well over a hundred other smaller record
  types now go through shared modules. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Everything behaves exactly as before. Database access for these record types now lives in one place each, and an automatic check stops new code from reaching around it.
