---
date: 2026-10-27
title: Portfolio, actions, world and map pages load faster
summary: >-
  Your portfolio and the actions page now get everything they need in one
  request instead of two. The world, combat, international organizations,
  notifications, budget, commodity and map pages download far less code.
tags: [performance, mobile]
badges: [minor]
areas: [frontend, backend]
---

- The portfolio includes your index fund positions in its first response.
- The actions page receives your home state's figures with your character, so
  costs show without a second request.
- Heavy pages load values the server computes instead of the full rule tables.
