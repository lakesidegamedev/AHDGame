---
date: 2026-11-10
title: "Starting a new world with a missing or unknown scenario now stops with a clear error"
summary: >-
  World setup, reset and the 2027 pre-launch check refuse a missing or
  unrecognised scenario before changing anything. Live worlds are unaffected.
tags: [admin, seeding]
badges: [patch]
areas: [engine, backend]
---

Setting up or resetting a world with a scenario name that does not exist used to
quietly fall back to a modern setup. It now stops before anything is written and
says which scenario name was missing or not recognised.

Running worlds are not affected. The hourly turn keeps its safe fallback, so a
live game can never fail over a stored scenario name.
