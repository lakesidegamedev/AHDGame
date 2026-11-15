---
date: 2026-11-14
title: "The home and sign-in pages download less code"
summary: >-
  The home and sign-in pages no longer download the code for signed-in only
  parts of the page, such as the status bar, the Ask drawer and the footer
  extras, so they start up faster on a phone.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- Signed-in only page furniture is loaded only when you are signed in.
- A small helper no longer drags the game's version file and country data into the home page.
- Nothing about how the pages look or work has changed.
