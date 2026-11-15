---
date: 2026-11-11
title: "State records get one shared front door"
summary: >-
  Behind the scenes, every read and write of the state records now goes
  through one shared module. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. States behave exactly as before. Their database access now lives in one place, and an automatic check stops new code from reaching around it, which makes state bugs easier to find and prevent.
