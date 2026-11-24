---
date: 2026-11-24
title: "The first Congress photo starts loading earlier"
summary: >-
  The browser starts downloading the selected chamber photo with the page,
  before the chamber controls finish loading.
tags: [performance]
badges: [patch]
areas: [frontend]
---

## What changed

- The first Senate or House photo loads from the initial page response.
- Congress loads the code for its own chambers as the page opens.
