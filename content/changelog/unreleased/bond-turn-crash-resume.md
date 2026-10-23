---
date: 2026-10-23
title: A turn interrupted during bond settlement now finishes on its own
summary: If the hourly turn stops partway through bond settlement, it now picks up and completes without manual repair.
tags: [turns, reliability, bonds]
badges: [patch]
areas: [engine]
---

- When the turn was interrupted during bond settlement, it previously stayed stuck until staff repaired it by hand. It now works out exactly what had already been settled, finishes any government bond sale that was halfway through, and completes the turn.
- Turns that cannot prove what was settled still stop and wait for staff, as before.
