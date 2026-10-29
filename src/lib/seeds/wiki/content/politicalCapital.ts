export const politicalCapitalContent = `# Political Capital

You want a governor's endorsement for your Senate race, and she barely knows you. Political Capital is how you fix that: you work on one non-player politician ([NPP](/wiki/npps-overview)) at a time, and you spend character actions and campaign funds to improve your relationship with them, raise or lower their public favorability, or raise or lower their political influence. Relationship is the number that unlocks the useful things: NPP endorsements, caucus members and a better chance of persuading them on votes.

Every action is deterministic. There is no dice roll: if you meet the requirements, the effect happens exactly as listed.

## Three numbers on every NPP

Each NPP has a **relationship** with you, from -100 to 100, starting at 0. You change it with the actions below. Separately, each NPP has a **favorability** (0 to 100, how the public sees them) and a **political influence** (0 to 100, how much reach they have). Those two are the numbers an NPP carries into an election as a candidate (see [NPP Elections](/wiki/npp-elections)), so boosting an ally or cutting down a rival changes how strong they are on a ballot.

Relationship does not stay put. Every turn it moves 0.1 closer to zero (that is [NPP Behavior](/wiki/npp-behavior) at work), so a +5 private meeting is worth about 50 turns of upkeep. Letting a relationship go cold is how caucus members walk out (see [Caucuses](/wiki/caucuses)).

### What each action costs and gives

| Action | Actions | Funds | Needs relationship of at least | Effect |
| --- | --- | --- | --- | --- |
| Request Endorsement | 6 | 0 | 40 to 50 (see below) | Public endorsement in one of your current races |
| Private Meeting | 3 | 0 | -50 | +5 relationship |
| Boost Favorability | 5 | 10,000 | none | +3 favorability, +2 relationship |
| Reduce Favorability | 5 | 10,000 | none | -3 favorability, -2 relationship |
| Boost Influence | 6 | 20,000 | none | +2 influence, +2 relationship |
| Reduce Influence | 6 | 20,000 | none | -2 influence, -2 relationship |

Funds are campaign funds in your home currency. Gains from the Boost actions and the private meeting are scaled by your [Charisma](/wiki/rpg-stats): at Charisma 1 they are 18% smaller, at 10 they are 18% larger, then rounded. A private meeting gives +4 at Charisma 1, +5 at 5 or 6, and +6 at 10. Reductions are never scaled. Relationship stays between -100 and 100.

### Asking for an endorsement

An endorsement is for one race you are running in right now, so you need an active candidacy (see [Election Mechanics](/wiki/election-mechanics); a secured endorsement attaches to that candidacy) and the NPP must be from your country. The NPP agrees only if your relationship is high enough:

\`\`\`
required relationship = 40 + (economic gap + social gap), with the gap total capped at 10
\`\`\`

The gaps are the distances between your policy positions and theirs on the economic and social axes. A perfect match needs 40. The worst match needs 50. The panel shows "Likely to accept" or "Likely to decline" for each of your candidacies, and a request that would be declined is refused before you pay anything.

### When an action is refused

Nothing is charged when an action is refused. It is refused if:

- the NPP is retired;
- you lack the actions or funds;
- the relationship is below the minimum for the action;
- a Boost would push favorability or influence past 100, or a Reduce would push it below 0.

There is no per-turn or per-NPP cap on how many times you can act. Your action balance and funds are the limit.

### Winning over the governor

You are running for Senate. An NPP governor sits at relationship 10. Her economic position is 3 away from yours and her social position is 2 away, so the required relationship is 40 + 5 = 45. You need 35 more.

- At Charisma 5, each private meeting gives +5. Seven meetings cost 21 actions and 0 funds, taking you to 45. The endorsement costs 6 more: 27 actions total.
- At Charisma 10, each meeting gives +6. Six meetings (18 actions) reach 46, and the endorsement makes 24 actions total.
- The funded route is far worse. Boost Favorability gives only +2 relationship for 5 actions and 10,000, so reaching 45 that way would cost about 90 actions and 180,000 in funds.

Do the meetings and the request close together. Drift costs only 0.1 per turn, but over weeks it adds up.

## Where to do it

Open an NPP's profile page. Your actions and funds pay for everything on it; see [NPPs Overview](/wiki/npps-overview). The Political Capital panel shows the relationship with a label (Ally above 60, Friendly above 20, Cordial above -20, Cool above -50, otherwise Hostile), your current actions and funds, and a button per action. Choose which of your candidacies you want endorsed before you request one.

Tips:

- **Private meetings are the best deal.** 3 actions for +5, no funds. Use them to build toward any threshold.
- **Weaken a rival's influence, not just their favorability.** Influence is the harder number to rebuild for them.
- **Keep caucus NPPs above 30.** Caucus members leave when their relationship with the chair falls below 20, and the health card flags them from 30.
- **Persuasion benefits too.** When you spend influence attempts on an NPP, each relationship point adds 0.15 points to your success chance, so relationship 40 adds 6.

Applies in every world and era, for every NPP in your own country; retired NPPs cannot be targeted. Last checked 2026-10-29, version 1.18.0. Exact rules: [NPP system design page](https://docs.lakesidegames.net/design/npp-system.html)
`;
