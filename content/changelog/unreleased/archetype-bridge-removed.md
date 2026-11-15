---
date: 2026-11-09
title: "Voter groups now run on census buckets only"
summary: >-
  Approval, turnout and policy effects now apply straight to census groups
  such as age, education and income. The old translation layer from the twelve
  voter archetypes is gone.
tags: [elections, demographics, engine]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Candidate approval, campaign contact and policy effects land directly on census groups. Nothing is translated through the old voter archetypes any more.
- District pressure on legislators who vote on a bill is now weighted by the real census make-up of their home region.
- Effects described to players name census groups only.
