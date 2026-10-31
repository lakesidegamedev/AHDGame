---
date: 2026-10-27
title: Election lists load faster
summary: >-
  Election lists and country election pages now read only the polling history
  each race shows, instead of every poll ever recorded for every listed race.
tags: [performance, elections]
badges: [patch]
areas: [backend]
---

Election lists fetch the latest poll, or the last 72 turns of polls, for each
race directly instead of loading each race's full polling history first.
