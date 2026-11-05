---
date: 2026-11-05
title: Sites that supply your own company no longer show a fake loss
summary: >-
  Profit and margins on the company and sector pages now count what your sites
  send each other, and the Internal supply panel shows what your sites actually
  sent your other sites last turn.
tags: [economy, corporations, supply]
badges: [patch]
areas: [fullstack]
---

## What changed

- When you price internal supply at production cost or market price, the income
  your supplying site earns and the charge your receiving site pays now count in
  profit and margin on the company page and the sector page. A site that mostly
  supplies your own company no longer reads as -999%.
- With free internal supply, a supplying site books no sale. Its row and its
  sector page now show what it sent your own sites, valued at its own asking
  price. The margin counts that value, so a plant that feeds your other sites
  shows what it is worth to you.
- Your company's cash, tax, pay and share value do not change. This is what the
  screens show, not what the game books.
- The Internal supply panel in the CEO office now lists each good your sites
  made last turn, how much went to your own sites, and how much was sold to
  others. It used to say nothing was reserved for every company.
- The supply priority choice now reads the way it works: own sites first is the
  default, and Open market first sends your output to outside buyers first,
  with your own sites using what is left.
- When a plant is short of something your company also makes, the note under
  its inputs now says what happened: your other sites used all of it, your sites
  made only so much, or outside buyers took it first because you chose the open
  market. It no longer tells you to change a setting or haul freight when that
  would not help.
