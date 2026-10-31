---
date: 2026-10-28
title: Short links to politicians, parties, budget and policy now land on the right page
summary: >-
  Addresses like /politicians now send visitors straight to their country page
  on the server, so shared links, search engines and text-only browsers no
  longer land on a blank screen.
tags: [routing, navigation, accessibility]
badges: [patch]
areas: [frontend]
---

## What changed

- The short root addresses `/politicians`, `/parties`, `/parties/<id>`,
  `/parties/coalition/<id>`, `/budget`, `/approval` and `/policy` now redirect
  on the server to the matching country page, defaulting to the United States
  when no country is given.
- Before, those addresses redirected only after the page loaded in a browser,
  so anything that fetched the page without running the script (search engines,
  link previews, text-only readers) saw an empty page.
