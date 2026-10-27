---
date: 2026-10-27
title: National chairs can propose through party legislators
summary: >-
  National party chairs can introduce laws through a randomly selected seated
  party NPP. Each party can have one NPP bill in progress across all national chambers.
tags: [legislation, parties, npps]
badges: [minor]
areas: [fullstack]
---

## What changed

- National legislature pages offer eligible national party chairs a proposal action without needing their own seat.
- The selected party NPP introduces the bill in its actual chamber, with normal chair-paid costs and passage refunds.
- The party-wide NPP limit includes autonomous bills, foreign-policy bills, second-chamber votes, cabinet review and veto stages. Human-sponsored bill limits are unchanged.
- Migration national-party-npp-bills adds a partial unique index, also restored by bootstrap. Existing duplicate active NPP bills must resolve before applying it; no player bills are deleted. Optional payer ids need no backfill.

Tracks #5054.
