---
date: 2026-11-09
title: "Bill approval previews use demographic buckets"
summary: >-
  The approval preview shown when you propose or read a bill, and the district
  pressure on legislators, now work from the same demographic buckets the
  elections count.
tags: [legislation, demographics, polls]
badges: [patch]
areas: [frontend, backend]
---

## What changed

- A policy option's authored approval effects are keyed by demographic bucket (for example `education:no_college`) instead of by voter group. No option had authored values, so previews look the same.
- The old unused "group approvals" field on policy options is gone.
- District pressure on a legislator's vote weighs a policy's bucket approvals by how much of the home state falls in each bucket.
