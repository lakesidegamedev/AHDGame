---
date: 2026-11-23
title: "The website can now use more of the server"
summary: >-
  The game's website can run several copies of itself on the same server, so
  one busy page no longer slows down everyone else's.
tags: [performance]
badges: [patch]
areas: [backend]
---

The website used to build every page on a single processor core, so players
waited in one line whenever the site was busy. It can now run several copies
side by side and send each page to the least busy one. Anything that changes
the game, like actions, trades and votes, still goes through one copy, so it
behaves exactly as before.
