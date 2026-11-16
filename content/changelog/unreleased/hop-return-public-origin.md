---
date: 2026-11-16
title: "Discord, Google and Apple sign-in return you to the game"
summary: >-
  Signing in with Discord, Google or Apple could end on a broken localhost page
  instead of the game.
tags: [accounts]
badges: [patch]
areas: [backend]
---

After a Discord, Google or Apple sign-in, the game passes you through the
Lakeside account service and back. The last step sent the browser to the game
server's internal address, so players landed on a "localhost refused to
connect" page instead of the game. It now returns to the game's public address.
