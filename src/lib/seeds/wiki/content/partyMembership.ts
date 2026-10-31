export const partyMembershipContent = `# Party Membership

Joining a party is cheap to do and slow to undo. You get its primaries, its whips, its state organization and its leadership races. You pay for it with a slice of your income, your party influence goes back to zero, and you cannot join another party for 24 hours. Playing as an independent is possible but gives you almost none of the party tools.

## Getting in

You join from the party's page or your character's party settings. In an **open** party the join takes effect at once. Some parties are set to **approval only**: your join becomes a request, and the chair (or the vice chair when the chair seat is empty, see [Party Leadership & Authority](/wiki/party-leadership-authority)) accepts or declines it. Whether a party is approval only is a choice its [leaders](/wiki/party-leadership) make.

Not every party will take you:

- It must be a party in your own country.
- It must already be present in your home region or in a region next to it. A party counts as present where it has a member, an elected official or an active NPP. This stops a party jumping to the other side of the map, and it is why the party's footprint in [Political Parties](/wiki/political-parties) decides your options. If a party is not yet near your home region, join one that already has a presence in or next to it.
- You must not have been expelled from that party in the last 24 turns.
- You must not have joined a party within the last 24 hours.

If the party is a built-in one with no chair at all, joining makes you its chair.

## The 24 hour delay

Every join starts a **24 hour** delay before you can join another party. The delay is counted from your last join, not from when you leave. Leaving to become an independent does not start a new delay, but it also does not clear the one you already have: if you joined A ten minutes ago and quit, you still wait about 24 hours to join B. If you have been in A for a week and quit, you can join B immediately. After a world reset there is one free party move that ignores the delay.

If you want to test a party, join from independent early, since the delay and the tenure clock both start at that moment.

## What a switch does to you

Decide before you start a campaign. Leaving or switching ends your old-party primary runs, though joining from independent keeps the races you entered.

| Your situation | What happens |
| --- | --- |
| Party influence | Reset to 0 on every join and every leave |
| Offices you already hold | Kept. Your seat stays yours and now shows your new party |
| Active primaries as a member of the old party | Withdrawn |
| Active primaries and races you entered as an independent | Moved to your new party when you join from independent |
| Party leadership posts, party elections, committee seat, endorsements | Cleared or withdrawn when you leave or switch |
| Leadership tenure clock | Restarts at your join (24 turns before you can run for or vote in leadership) |

![Timeline of joining party A, leaving to be independent and joining party B after the 24 hour delay, and how races move when you switch.](/wiki-images/diagrams/party-membership-switch-timeline.svg)

The tenure clock matters if you want to run for chair: you need 24 turns in the party before you can run or vote, so check it first.

## What membership costs

Every member pays two taxes out of their hourly income: a **state tax** to the state party treasury and a **national tax** to the national party treasury. Each rate is set by that level's leaders from 0% to 33%. Both are taken from your total income, not one after the other. Independents pay nothing. That money fills the treasuries that fund Political Strength and budgets in [Party Actions](/wiki/party-actions).

You earn ₳20,000 an hour. Your state party taxes 10% and the national party 5%. You pay ₳2,000 and ₳1,000 and keep ₳17,000. Leaving the party stops both taxes.

| Item | Value |
| --- | --- |
| Delay before joining another party | 24 hours since your last join |
| Delay after being expelled from a party | 24 turns, for that party only |
| Leadership tenure before you can run or vote | 24 turns in the party |
| Party tax rate (state and national, each) | 0% to 33% of your income |
| Party influence after join or leave | 0 |

## What you give the party

A member in a state gives the party the presence it needs to build Org there ([Party Organization](/wiki/party-organization)), and each active member raises the number of NPPs the party can field ([NPPs Overview](/wiki/npps-overview)). Members vote in leadership elections once they have 24 turns of tenure. A custom party with no members and no seats is deleted unless a charter protects it.

Leaders can tell you how to vote on bills and leadership races. A whip never forces your vote, and there is no automatic penalty, but leaders see who follows it. See [Voting & Whips](/wiki/voting-and-whips).

Last checked 2026-10-29, version 1.18.0. Exact rules: [Parties design page](https://docs.lakesidegames.net/design/parties.html)
`;
