import {
  MINISTERIAL_ACTION_ACCRUAL_TURNS,
  MINISTERIAL_ACTION_CAP,
} from "@/lib/constants/cabinetMechanicsTypes";
import { OFFICE_POOL_TOP_UP_AP_COST } from "@/lib/actions/officePoolTopUpRules";

/**
 * Cabinet Guide wiki page. The intro is short static markdown; the full
 * per-country, per-seat reference is rendered live by the `cabinet-guide`
 * widget (src/components/wiki/widgets/CabinetGuide.tsx), which reads the
 * cabinet mechanics constants directly so the page never rots.
 */
export const cabinetGuideContent = `# Cabinet Guide

A minister in this game is not a title. Every cabinet seat in A House Divided is a real executive office with its own dashboard, metrics, and levers. This page is the live reference for every country's cabinet: pick a country tab below to see each post in succession order, the metrics it influences, and every action it can take.

## Who appoints the ministers

- **Presidential systems (US, NG):** the President nominates and the Senate confirms. See [Cabinet](/wiki/cabinet) and the [Confirmation Process](/wiki/confirmation-process).
- **Parliamentary systems (UK, DE, JP, IE):** the head of government appoints ministers directly after [Government Formation](/wiki/government-formation), with no confirmation vote. The whole cabinet resets when the government changes. One-party states (China, the Soviet Union, East Germany) also appoint ministers directly, by the Premier, the Chairman of the Council of Ministers or the General Secretary. Scotland and Wales are latent countries; they are not live player cabinets.

## The levers a seat can pull

Each seat combines some of the following levers, all detailed per post in the reference below:

- **Tier settings:** a standing national policy stance that applies passive per-turn metric effects. Free to hold and to change, but once changed it cannot be changed again for 24 turns.
- **Regional targets:** pick one region for focused per-turn effects, sometimes at a small cost to every other region.
- **Emergencies:** one-off interventions that cost a ministerial action and deliver a large temporary effect for a fixed number of turns.
- **Allocations:** divide a national funding pool across regions.
- **Advocacy:** territorial seats can petition for their region, granting a standing boost while active.
- **Bond profiles:** finance seats set the maturity split of sovereign debt issuance.
- **Buildings:** most seats can build persistent assets in regions: portfolio estates (schools, hospitals, embassies, and more), power plants on the energy seat, or multi-turn infrastructure projects on the transport seat. See [Cabinet Projects & Buildings](/wiki/cabinet-projects).

Active mechanics spend **ministerial actions** (cabinet actions in presidential systems). You regain 1 action every ${MINISTERIAL_ACTION_ACCRUAL_TURNS} turns, up to ${MINISTERIAL_ACTION_CAP}, and once per turn you can spend ${OFFICE_POOL_TOP_UP_AP_COST} AP to buy 1 more.

Here is how the first 12 turns in a seat go: you start with ${MINISTERIAL_ACTION_CAP} actions. You spend 2 on emergencies on day one, leaving 2. After ${MINISTERIAL_ACTION_ACCRUAL_TURNS * 2} turns you have ${MINISTERIAL_ACTION_CAP} again. Tier settings and fund changes cost no actions (a changed setting is locked for 24 turns), so save actions for emergencies and builds.

Seats with no associated laws, such as the White House Chief of Staff, have no allocations tab because they have no department budget.

## Per-country reference

Everything below is read directly from the game's configuration, so numbers and descriptions are always current.

\`\`\`cabinet-guide
\`\`\`

Last checked 2026-10-29, version 1.18.0. Exact rules: [Cabinet design doc](https://docs.lakesidegames.net/design/cabinet.html)
`;
