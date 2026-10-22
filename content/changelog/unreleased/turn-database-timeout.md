---
date: 2026-10-22
title: Turns ride out slow database moments
summary: Turn processing now waits longer for slow database operations instead of skipping a step.
tags: [turns, reliability]
badges: [patch]
areas: [backend]
---

- Turn processing now allows slow database operations more time to finish, so a brief slowdown no longer causes a turn step, such as banking, to be skipped.
