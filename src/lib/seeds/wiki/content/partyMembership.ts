export const partyMembershipContent = `# Party Membership

Joining a party gets you into its primaries, its whips, its state organization and its leadership races. It also costs you a share of your income and resets your party influence, and you cannot change parties again for 24 hours. Playing as an independent is possible but gives you almost none of the party tools.

## How it works

You join from the party's page or your character's party settings. In an **open** party the join takes effect at once. Some parties are set to **approval only**: your join becomes a request, and the chair (or the vice chair when the chair seat is empty) accepts or declines it.

### Who can join which party

- It must be a party in your own country.
- It must already be present in your home region or in a region next to it. A party counts as present where it has a member, an elected official or an active NPP. This stops a party jumping to the other side of the map.
- You must not have been expelled from that party in the last 24 turns.
- You must not have joined a party within the last 24 hours (see below).

If the party is a built-in one with no chair at all, joining makes you its chair.

### The 24 hour delay

Every join starts a **24 hour** delay before you can join another party. The delay is counted from your last join, not from when you leave. Leaving to become an independent does not start a new delay, but it also does not clear the one you already have: if you joined A ten minutes ago and quit, you still wait about 24 hours to join B. If you have been in A for a week and quit, you can join B immediately. After a world reset there is one free party move that ignores the delay.

### What a switch does to you

| Your situation | What happens |
| --- | --- |
| Party influence | Reset to 0 on every join and every leave |
| Offices you already hold | Kept. Your seat stays yours and now shows your new party |
| Active primaries as a member of the old party | Withdrawn |
| Active primaries and races you entered as an independent | Moved to your new party when you join from independent |
| Party leadership posts, party elections, committee seat, endorsements | Cleared or withdrawn when you leave or switch |
| Leadership tenure clock | Restarts at your join (24 turns before you can run for or vote in leadership) |

### Taxes

Every member pays two taxes out of their hourly income: a **state tax** to the state party treasury and a **national tax** to the national party treasury. Each rate is set by that level's leaders from 0% to 33%. Both are taken from your total income, not one after the other. Independents pay nothing.

### Key numbers

| Item | Value |
| --- | --- |
| Delay before joining another party | 24 hours since your last join |
| Delay after being expelled from a party | 24 turns, for that party only |
| Leadership tenure before you can run or vote | 24 turns in the party |
| Party tax rate (state and national, each) | 0% to 33% of your income |
| Party influence after join or leave | 0 |

### Worked example

You earn ₳20,000 an hour. Your state party taxes 10% and the national party 5%. You pay ₳2,000 and ₳1,000 and keep ₳17,000. Leaving the party stops both taxes.

## What you can do

- **Join, request to join, or leave** from the party page. A request to an approval-only party waits for its leader to answer.
- **Switch mid-campaign** only if you accept losing the races you entered under the old party. Joining from independent keeps your races.
- **Follow or ignore whips.** Leaders can tell you how to vote on bills and leadership races. A whip never forces your vote, and there is no automatic penalty, but leaders see who follows it. See [Voting & Whips](/wiki/voting-and-whips).
- **Check the tenure clock** before planning a run for chair: you need 24 turns in the party. See [Party Leadership & Authority](/wiki/party-leadership-authority).

**Tips.**
- Decide before you start a campaign. Leaving or switching ends your old-party primary runs.
- If you want to test a party, join from independent early, since the delay and the tenure clock both start at that moment.
- Joining a party that is not yet near your home region is refused. Join a party that already has a presence in or next to your region instead.

## Connections

**Driven by**

- [Political Parties](/wiki/political-parties): the party's footprint decides which parties you are allowed to join.
- [Party Leadership](/wiki/party-leadership): leaders set the tax rates and accept or decline requests in approval-only parties.
- [Party Leadership & Authority](/wiki/party-leadership-authority): the acting chair accepts join requests while the chair seat is empty.

**Affects**

- [Political Parties](/wiki/political-parties): a custom party with no members and no seats is deleted unless a charter protects it.
- [Party Leadership](/wiki/party-leadership): members vote in leadership elections once they have 24 turns of tenure.
- [Party Leadership & Authority](/wiki/party-leadership-authority): every join starts the 24 turn tenure clock.
- [Party Organization](/wiki/party-organization): a member in a state gives the party the presence it needs to build Org there.
- [Party Actions](/wiki/party-actions): member taxes fill the treasuries that fund Political Strength and budgets.
- [NPPs Overview](/wiki/npps-overview): each active member raises the number of NPPs the party can field.

## Status

Live in every world and country that has parties. Approval-only joining is a choice each party's leaders make.

Last checked: 2026-10-29, version 1.18.0

## Technical detail

The exact rules are on the [Parties design page](https://docs.lakesidegames.net/design/parties.html).
`;
