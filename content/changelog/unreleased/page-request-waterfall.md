---
date: 2026-10-27
title: Pages show your status sooner, especially far from the server
summary: >-
  The status bar now asks for your turn and money summary as soon as a page
  opens instead of after a separate sign-in check, and corporation and country
  pages start their side panels in parallel. Players far from the server save
  about a quarter second per page.
tags: [performance, mobile]
badges: [patch]
areas: [frontend]
---

- The status bar request starts with the first paint when you are signed in.
- A corporation's nationalization status and open votes load alongside the
  corporation itself.
- Country pages read the sovereign debt status once instead of three times.
