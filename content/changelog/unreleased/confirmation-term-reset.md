---
date: 2026-10-30
title: Scope acting cabinet rejection checks to the current presidency
summary: >-
  Presidents can appoint acting secretaries without being blocked by Senate
  rejections from a previous term. Office conflicts are no longer reported as
  Senate defeats when checking acting eligibility.
tags: [cabinet, confirmations, elections]
badges: [patch]
areas: [backend]
---

## What changed

- Acting appointment rejection checks use the sitting President and current term, including after re-election.
- Current-term Senate defeats still block acting appointments for the same nominee and office.
- Recorded central bank office conflicts do not count as Senate defeats. Historical votes and nomination records are preserved.
