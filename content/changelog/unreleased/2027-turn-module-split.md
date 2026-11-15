---
date: 2026-11-08
title: "Behind-the-scenes split of large turn and corporation files"
summary: >-
  Twelve of the largest turn, bond, banking and corporation files were split
  into smaller pieces so they stay easy to maintain. Nothing changes for
  players.
tags: [engine, maintenance]
badges: [patch]
areas: [engine, backend]
---

The code behind the bond turn, the corporation turn, election results, NPP
company decisions and investing, the producer market, bank treasury trading,
sovereign bonds, economic vital signs and the sector detail page was split into
smaller files. The turn does the same work in the same order, and every number
and screen is unchanged. A new check also stops other large files from growing
any further.
