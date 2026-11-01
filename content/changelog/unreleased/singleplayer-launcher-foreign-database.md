---
date: 2026-11-01
title: Singleplayer never opens another program's database
summary: >-
  If the database port a local world wants is already taken, the game now
  checks that it belongs to that world's own database before using it, and
  otherwise stops with a clear message.
tags: [singleplayer, launcher, stability]
badges: [patch]
areas: [backend]
---

## What changed

- The local launcher used to assume that anything listening on its database
  port was its own database. If it was another world's, setting up a new game
  would have cleared that other world. It now uses the port only when the
  running database is the one holding this world's files, and otherwise stops
  and says another program is using the port.
