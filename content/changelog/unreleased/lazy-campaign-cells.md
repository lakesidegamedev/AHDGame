---
date: 2026-11-24
title: "Presidential race projections compute faster"
summary: >-
  Election projections skip building detailed voter groups they do not use,
  cutting the work for the presidential race page by about a sixth.
tags: [performance, elections]
badges: [patch]
areas: [backend]
---

Projecting a primary rebuilt a detailed set of voter groups for every state
and party, even though the projection itself never uses them. They are now
built only when something reads them, such as targeted ads, with identical
results. The presidential race page and the elections list do about a sixth
less work, and turns benefit too.
