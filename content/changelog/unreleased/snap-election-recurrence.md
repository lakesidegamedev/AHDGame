---
title: Prevent repeated automatic snap elections
date: 2026-10-29
badges: [patch]
areas: [backend, engine]
tags: [elections, government]
---

Automatic snap-election retries now preserve an existing election instead of repeatedly dissolving the legislature and creating extra races. Concurrent automatic starts share one claim before any dissolution work. A depleted UK confidence gauge can dissolve a seated government, but cannot dissolve a vacant government again. Election-night totals exclude cancelled races, preserving the correct regional and seat counts.
