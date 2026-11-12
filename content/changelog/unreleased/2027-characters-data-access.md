---
date: 2026-11-11
title: "Player character records get one shared front door"
summary: >-
  Behind the scenes, every read and write of player character records now goes
  through one shared module. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Characters behave exactly as before. Their database access now lives in one place, and an automatic check stops new code from reaching around it, which makes character bugs easier to find and prevent.
