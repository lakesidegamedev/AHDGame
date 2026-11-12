---
date: 2026-11-11
title: "The world state record gets one shared front door"
summary: >-
  Behind the scenes, every read and write of the world state record now goes
  through one shared module. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. The world state behaves exactly as before. Its database access now lives in one place, and an automatic check stops new code from reaching around it, which makes world state bugs easier to find and prevent.
