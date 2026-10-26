---
date: 2026-10-26
title: Every page downloads less code
summary: >-
  The code every page loads before it is usable is about two thirds smaller,
  and country and election pages stop shipping country data and metric tables
  they never show. Biggest gain on phones.
tags: [performance, mobile, frontend]
badges: [minor]
areas: [frontend]
---

## What changed

- Country names, flags, menus and labels now come from a small generated
  table instead of the full country rulebook, which used to ride along on
  every page.
- The shared code behind the navigation bar, status bar and site shell is
  about a third of its old size.
- The tutorial coach, season recap, feedback form and stat allocator now load
  only when they open.
- Country and election pages no longer download the full metric catalog up
  front.
