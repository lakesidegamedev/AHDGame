---
date: 2026-10-23
title: A released subsidiary now names its owner as a controlling shareholder
summary: >-
  After a subsidiary was released, the corporation page still called the
  majority owner "Parent", so players thought the release had failed. Parent
  now appears only while a formal subsidiary relationship exists.
tags: [corporations, subsidiaries]
badges: [patch]
areas: [frontend]
---

## What changed

- The Structure panel says Controlling shareholder when a corporation has a majority corporate owner but no formal subsidiary relationship, and notes that the owner has no management control.
- The masthead says Majority owner in the same case instead of Subsidiary of.
- A formalized subsidiary still shows Parent on the Structure panel and Subsidiary of on the masthead.
