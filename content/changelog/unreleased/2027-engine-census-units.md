---
date: 2026-11-09
title: "Vote engines count census units directly"
summary: >-
  The vote allocation, median voter and turnout estimates now read the census
  electorate units directly instead of a stored voter-group table.
tags: [elections, demographics]
badges: [patch]
areas: [backend]
---

## What changed

- Vote shares, the median voter and primary turnout all read the same census electorate units.
- Results are unchanged; this removes the last stored voter-group shape from the vote engines.
