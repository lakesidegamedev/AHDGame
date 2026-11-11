---
date: 2026-11-11
title: "A check keeps old laws priced in running worlds"
summary: >-
  Internal check with no change for players: removing an old law type now fails
  the build unless running worlds keep a price for it.
tags: [budget, legislation]
badges: [patch]
areas: [engine]
---

No visible change. When an old law type is retired, worlds already running
still have it in force. A new check fails the build if a retired law would lose
its budget price, so its programmes cannot quietly drop to zero.
