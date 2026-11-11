---
date: 2026-11-11
title: "Smaller admin bundle for the law type editor"
summary: >-
  The law type editor now loads its list of voter groups from the server
  instead of building it in the browser, which kept every country's voter
  model out of the page download.
tags: [engineering]
badges: [patch]
areas: [frontend]
---

## What changed

- The demographic targeting step of the admin law type editor loads its voter groups from the server.
- Country voter models no longer ship to the browser through that editor.
- Canada's founding Commons table no longer pulls the party roster into the browser.
