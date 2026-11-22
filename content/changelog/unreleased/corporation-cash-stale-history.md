---
date: 2026-11-21
title: "Corporation Charts tab shows current cash when history lags"
summary: >-
  If a company's recorded history stops short of the current turn, the Cash on
  hand row now shows the live balance and says where the record ends.
tags: [corporations, display]
badges: [patch]
areas: [fullstack]
---

The Charts tab on a company page listed the last recorded cash figure as the
latest one, even when the recorded history had stopped several turns earlier.
That could show a healthy balance for a company that was actually overdrawn.

When the history is behind the current turn, the Cash on hand row now shows the
company's current balance and notes which turn the record ends at.
