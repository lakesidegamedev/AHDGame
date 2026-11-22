---
date: 2026-11-22
title: "Political commands recover without partial changes"
summary: >-
  Party mergers preserve treasury balances. Appointments, coalition admissions,
  confidence motions and impeachments recover together after interruptions.
tags: [politics, parties, elections, cabinets]
badges: [patch]
areas: [engine, backend]
---

## What changed

- Party mergers transfer national and regional treasury balances once, including negative balances and regions without organization.
- Impeachment convictions commit with office removal and cannot remove a replacement office-holder.
- A PM must still hold office when a snap election commits.
- Coalition admissions, no-confidence motions and acting appointment charges commit with their related records.
- Admin PM removal restores surviving parliamentary offices and clears cabinet state together. Canadian appointment support uses the correct chamber.
- Committee proposal effects and their resolution status commit together, allowing safe retries after interruptions.
