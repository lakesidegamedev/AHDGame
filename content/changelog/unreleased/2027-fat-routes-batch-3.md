---
date: 2026-11-09
title: "Status bar, fund redemption, relocation and executive endpoints split into focused modules"
summary: >-
  The status bar, fund redemption, corporate relocation, executive overview,
  party whip leadership and Discord support endpoints now run from their own
  modules. Nothing changes in play.
tags: [maintenance]
badges: [patch]
areas: [backend]
---

The status bar data, redeeming fund shares, relocating with a corporation, the
executive overview, whippable leadership votes and the Discord support
endpoints behave exactly as before. Their logic now lives in dedicated modules
instead of the endpoint files, which makes future fixes safer.
