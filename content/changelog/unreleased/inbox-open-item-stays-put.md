---
date: 2026-11-08
title: Opening an inbox item no longer jumps to another one
summary: >-
  An unread inbox item now stays open on the list after you click it, instead
  of dropping out and showing a different message.
tags: [inbox, notifications]
badges: [patch]
areas: [frontend]
---

## What changed

- Opening an unread item marks it read. In Needs action and busy inboxes that
  used to remove it from the list and switch the reading pane to another item.
  The item you opened now stays selected until you open something else.
