---
date: 2026-11-13
title: "Public pages download less text"
summary: >-
  Signed-out visitors on the landing, guides, about, FAQ, login and similar pages
  no longer download the interface text for parts of the game they cannot see.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- Public pages send only the text they use, about 190 KB less per page before compression.
- Signed-in players are unchanged and still get everything.
