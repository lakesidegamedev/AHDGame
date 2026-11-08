---
date: 2026-11-09
title: "Crisis approval changes apply exactly once"
summary: >-
  The approval gain or loss that follows a crisis can no longer be applied
  twice if the game server stops or loses its connection at the wrong moment.
tags: [crises, politics]
badges: [patch]
areas: [backend, engine]
---

## What changed

- Each approval change that follows a crisis is now recorded on the approval figure it changes, in the same step. If the server restarts or a connection error hides whether a change landed, the retry sees the record and does not apply it again.
