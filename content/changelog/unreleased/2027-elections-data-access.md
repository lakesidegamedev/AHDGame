---
date: 2026-11-11
title: "Election records get one shared front door"
summary: >-
  Behind the scenes, every read and write of election records now goes through
  one shared module. Nothing changes in play.
tags: [engine]
badges: [patch]
areas: [engine, backend]
---

This is a tidy-up of how the game is built. Elections behave exactly as before. Their database access now lives in one place, and an automatic check stops new code from reaching around it, which makes election bugs easier to find and prevent.
