---
date: 2026-11-06
title: "Maintainers can approve contributor PRs from a comment"
summary: >-
  Contributor pull requests that touch economy or CI files can now be approved
  with a maintainer comment, and promotion pull requests skip the contributor checks.
tags: [tooling]
badges: [patch]
areas: [backend]
---

## What changed

- A maintainer comment of the form `/approve <commit>` on a pull request now counts like an approving review for that exact commit. A later push needs a fresh comment.
- Promotion pull requests from `development` to `staging` and from `staging` to `main` in this repository skip the contributor governance checks, since their content was checked when it entered `development`. Pull requests from forks never qualify.
- The governance check re-runs when such a comment is posted.
