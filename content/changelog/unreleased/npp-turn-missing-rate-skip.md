---
date: 2026-11-25
title: "A missing exchange rate no longer stops a turn"
summary: >-
  Computer-run companies with sites in euro countries no longer stop the turn.
  If one company still cannot be valued, it skips its decisions for that turn.
tags: [turns, corporations, currency]
badges: [patch]
areas: [backend]
---

Computer-run companies plan with the same exchange rates the rest of the turn
uses, including for sites in euro countries. If a single company still cannot
be valued, it skips its decisions for that turn and the turn carries on.
