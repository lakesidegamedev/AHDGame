---
date: 2026-10-26
title: Portfolio history records turns with an all short-term holding
summary: A large holding bought entirely within the short-term window no longer stops that turn's portfolio history from being saved.
badges: [patch]
areas: [backend]
tags: [portfolio, turn]
---

A portfolio whose shares were all bought inside the short-term window could stop the turn from saving that turn's portfolio history, which left a gap on every player's wealth chart. The total and the short-term split are now valued the same way, so the snapshot saves normally.
