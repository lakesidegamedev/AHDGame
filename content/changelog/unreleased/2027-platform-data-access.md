---
date: 2026-11-11
title: "Accounts, settings, metrics and logs get shared front doors"
summary: >-
  Behind the scenes, every read and write of user accounts, game settings,
  state metrics, laws, cabinets, notifications, logs and similar records now
  goes through shared modules. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Everything behaves exactly as before. Database access for each of these record types now lives in one place, and an automatic check stops new code from reaching around it, which makes bugs easier to find and prevent.
