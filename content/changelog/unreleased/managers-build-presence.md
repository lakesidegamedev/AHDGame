---
date: 2026-11-05
title: "Campaign managers can build Campaign Presence"
summary: >-
  Campaign managers can now build Campaign Presence for their ticket, paid from
  the campaign's funds and actions as before.
tags: [elections, campaigns, political-operations]
badges: [minor]
areas: [fullstack]
---

## What changed

- Campaign managers can now build Campaign Presence for their ticket, paid from the campaign's funds and actions as before. Open the race in Campaign mode, click a state on the map and use the build button in Your campaign here.
- Prices, the one build per state per turn limit and what presence is worth are unchanged. The level is the candidate's, and it counts for the ticket as it always has.
- The running mate and everyone outside the campaign still cannot build, and a campaign that has been eliminated or suspended cannot be built for.

## Developer notes

- `POST /api/political-operations/state-org/build` takes an optional `campaignId`. Without it nothing changes. With it, `resolvePresenceSubject` (`src/lib/campaigns/statePresenceAccess.ts`) loads the campaign, checks the caller is the candidate's own account or a manager (`isCampaignManagerUser`), refuses archived and suspended campaigns and NPP tickets, and returns the candidate. The row is written under the candidate, priced in the candidate's home currency and debited from the campaign through the same guarded update.
- A manager's build also writes an `activityLog` game action (`state_org_build`) naming the manager, best effort. `Campaign.activityHistory` has no actor field and is capped, so presence builds do not go there.
- `GET /api/political-operations/state-org/list` takes the same optional `campaignId` and returns the candidate's rows for a manager.
- The map reads `presenceBuildAccess` (`src/lib/campaignManager/mapActions.ts`) to decide between the candidate's own list, the campaign-named list for a manager, and no build.
