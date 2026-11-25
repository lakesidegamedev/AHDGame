---
date: 2026-11-25
title: "Smoother phone loading for Actions, Inbox, and Campaign Manager"
summary: >-
  Actions loads a photo sized for the screen and fetches portfolio details when opened.
  Inbox and Campaign Manager hold their controls in place while data loads.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- Actions shows its filters and reserves space for figures as the page loads.
- Inbox holds the heading and tabs in place while fetching messages.
- Campaign Manager reserves room for the phone race filters above the map.
