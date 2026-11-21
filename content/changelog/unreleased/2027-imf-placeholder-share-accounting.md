---
date: 2026-11-17
title: "New worlds no longer start with an IMF that has shares nobody owns"
summary: >-
  After a reset the IMF now starts with zero shares until its Board is
  assigned, instead of 10 million shares with no owners. This stops a false
  share accounting alarm in new worlds.
tags: [reset, imf, corporations]
badges: [patch]
areas: [engine]
---

The placeholder IMF created at reset recorded the era's founder share count
with an empty cap table. The Board seed form already mints the shares when it
assigns holders, so the placeholder now starts at zero.
