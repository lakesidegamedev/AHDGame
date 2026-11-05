---
date: 2026-11-05
title: "The presidential race page now has a Campaign mode"
summary: >-
  Your campaign desk now opens inside the presidential race page. A Race and
  Campaign switch sits beside the title, and clicking a ticket in the race
  opens that campaign without leaving the page.
tags: [elections, campaigns, ui]
badges: [feature]
areas: [elections, campaigns]
---

## What changed

- The presidential race page has a Race and Campaign switch beside the title, on desktop and on a phone. Race shows the map and scoreboard as before. Campaign shows the campaign desk for one ticket under the same title and ticker.
- If you are on a campaign in the race, as the candidate, a campaign manager or the running mate, the race page opens in Campaign mode. Everyone else opens in Race mode. The switch always overrides that, and the choice is in the web address, so you can share it or come back with the back button.
- Anyone can open a rival's campaign. You see exactly what you could see before: the full desk for your own ticket, more for your party, and the public view for everyone else.
- Clicking a ticket in the race page's tickets table, or a candidate in a primary field, opens that campaign in Campaign mode on the same page.
- Old campaign links still work. They now take you to the race page in Campaign mode, keeping the tab and state they pointed at. Russia, the Political Operations campaign tab and races that have not opened yet keep the old campaign page.
- Links to a campaign from the sidebar, wire items and the field office shortcut on the map go straight to the new place.

## Developer notes

- `src/components/campaign/CampaignWorkspace.tsx` holds the campaign desk (data, access logic, panels, retarget and opposition reset). `/campaign/[id]` is now a server page that redirects through `resolveCampaignRedirect` and otherwise renders the workspace.
- Mode resolution (`?view=race|campaign`, `&campaign=<id>`), the redirect decision and the link helper (`campaignPageHref` in `src/lib/campaignManager/links.ts`) are pure and unit tested.
- The race payload gains `myCampaignId`: the viewer's own campaign in the race as candidate, manager or running mate, read by `findViewerRaceCampaignId`. No access rules or API authorization changed.
