---
date: 2026-10-31
title: Production image installs cleanly again
summary: >-
  The test coverage plugin now matches the test runner version, so a strict
  dependency install no longer rejects the lockfile. No gameplay change.
tags: [build]
badges: [patch]
areas: [backend]
---

The test runner was bumped to 5.0.5 while its coverage plugin stayed on 5.0.3,
which only accepts runner 5.0.3. Installs that do not read the repository's npm
settings refused the lockfile, which stopped production image builds.
