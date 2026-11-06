---
date: 2026-11-06
title: Party chairs can file governor impeachments while their legislator has a bill running
summary: >-
  The "File articles through party legislator" option was hidden whenever the
  party's only legislator in the state was already sponsoring a bill, even
  though filing articles is not a bill.
tags: [legislature, impeachment]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- A party chair who directs a state legislator to file articles of impeachment
  against a governor no longer loses that option while the legislator has a
  bill in progress or a governor bill waiting for them.
- Bill proposals through a party legislator still use one legislator per bill.
