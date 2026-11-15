---
date: 2026-11-15
title: "Clearer error pages with one-click reporting"
summary: >-
  When a page fails to load, you now get a plain explanation, what to do next,
  a copyable reference, and a Report this problem button that fills in the details.
tags: [errors, support, ux]
badges: [minor]
areas: [frontend]
---

## What changed

- Error pages explain the problem in plain language for each kind of failure, with suggested next steps and Try again as the main action.
- Report this problem opens the in-game bug report with the page, error code, reference, time and build already filled in.
- The full reference can be copied in one click, so staff can find your exact error.
- Staff accounts see an expandable details panel with the error message, stack frames, route, build and error tracker event id. Players never see it.
- Error reports sent to the error tracker now include the route, the error message and the component stack.
