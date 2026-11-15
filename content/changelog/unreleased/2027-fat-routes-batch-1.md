---
date: 2026-11-08
title: "Five busy endpoints split into focused modules"
summary: >-
  Commodity details, cabinet briefings, cabinet bills, caucus whips and site
  search now run from their own modules. Nothing changes in play.
tags: [maintenance]
badges: [patch]
areas: [backend]
---

The commodity detail page, cabinet position briefings, cabinet bill listing and
proposals, caucus whip orders and the site-wide search behave exactly as before.
Their logic now lives in smaller, separately tested modules, which makes future
fixes to them safer.
