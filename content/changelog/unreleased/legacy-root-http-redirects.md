---
date: 2026-11-03
title: Old page addresses redirect straight away
summary: >-
  Old links such as /parties and /politicians now go straight to the country
  page instead of loading a blank page first.
tags: [web]
badges: [patch]
areas: [frontend]
---

## What changed

- Old addresses from before pages moved under a country, such as /parties,
  /politicians, /budget, /policy, /approval and old party and coalition links,
  showed a blank page for about a second before moving on. Link previews and
  search engines only ever saw the blank page.
- They now redirect straight to the country page. A `?country=` in the link
  still picks the country. Otherwise it goes to the United States.
- No game rules changed.
