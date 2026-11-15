---
date: 2026-11-14
title: Populate Canadian opening races and Campaign Manager maps
summary: Creates Canada's opening races during bootstrap and adds Canadian map coverage to Campaign Manager.
tags: [canada, elections, reset, maps, campaigning]
badges: [patch]
areas: [fullstack]
---

- Creates Commons, provincial legislature and Premier races before the first
  gameplay turn, using their existing calendars and election rules.
- Adds official Canadian provincial outlines and separate federal-riding and
  census-division layers to Campaign Manager for 2027 worlds.
- Shows an explicit empty state and country selector when no races are available.
