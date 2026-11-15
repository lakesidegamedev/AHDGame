---
date: 2026-11-10
title: "Money tables get one shared front door"
summary: >-
  Behind the scenes, every read and write of national budgets, bonds, central
  banks and the financial transaction log now goes through one shared module.
  Nothing changes in play.
tags: [economy, engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. National budgets, bonds, central banks and the financial transaction log behave exactly as before. Their database access now lives in one place, and an automatic check stops new code from reaching around it, which makes money bugs easier to find and prevent.
