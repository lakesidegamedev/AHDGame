export const coalitionFormationContent = `# Coalition Formation

A coalition is easy to build and hard to break up, because a disband vote counts absent chairs as no. This page is the how-to for [coalitions](/wiki/coalitions): creating one, bringing parties in, taking them out, handing over the chair and voting one out of existence. All of it is done by party chairs. Your party's national chair acts for it ([Party Leadership](/wiki/party-leadership)), or the vice chair when the chair seat is empty ([Party Leadership & Authority](/wiki/party-leadership-authority)). An acting vice chair can create, request to join, answer invites and leave, but cannot cast the party's disband vote.

![Lifecycle of a coalition from creation through invites and requests, leaving or kicking, chair transfer and a 24 turn disband vote that needs more than half of all member parties.](/wiki-images/diagrams/coalition-formation-lifecycle.svg)

## Starting one

Only a national party chair (or an acting vice chair) can create a coalition, and it costs the creator **25 actions**. On \`/parties\`, pick your country, open the Coalitions tab and click Create Coalition; non-chairs see the button greyed out with a reason. You choose a name (3 to 60 characters, unique in your country), an abbreviation (2 to 10 characters) and a colour. Your party becomes the first member and the **chair party**, and you become the coalition chair. A party already in a coalition cannot create another.

## Getting parties in

There are two routes. Either way, **a party can sit in only one coalition**, so the first route that completes wins and the other lapses. A party already in another coalition cannot be invited; it has to leave first. If you invite a party and they also request, accept whichever you like first.

1. **Invite.** From the coalition's Chair's Office tab, the coalition chair invites a party by its ID. The invited party's national chair sees a banner and accepts or declines.
2. **Request.** Any national chair can ask to join from the coalition page. The coalition chair sees it in their Chair's Office and accepts or declines. The requester can cancel at any time. A party can only have **one** pending request at a time.

## Leaving, being kicked, handing over

- **Leave.** Any member party's national chair can use Leave Coalition from the coalition's page.
- **Kick.** The coalition chair can remove any other member party. The removed party's chair is notified. The chair party cannot kick itself. There is no waiting period before a removed party can ask to join again.
- **If the chair party leaves:** the member who has been in longest (earliest join date) becomes the new chair party. If nobody is left, the coalition is deleted.
- **If a member party is deleted** by the empty-party cleanup, it is removed from the coalition, and the same succession applies if it was the chair party.
- **Hand over the chair.** The coalition chair can transfer the chair to any member party's national chair at any time from the Chair's Office. If that party's national chair changes later, the coalition chair follows automatically.

Kick, transfer and disband are in the Chair's Office and need the coalition chair. Who is in the coalition changes the bloc totals and which parties count as the minority, as [Coalitions](/wiki/coalitions) explains.

## Ending one

Only the **coalition chair** can start a disband vote, from the Chair's Office. Only one can run at a time. It lasts **24 turns** (24 hours at the standard pace). Each member party's national chair votes yes or no and can change their vote until the end. It is counted at the first turn after the 24 turns end, not the moment the last vote comes in.

The coalition is disbanded if yes votes are **more than half of all member parties**. A party that does not vote counts as no. If it passes, the coalition is deleted, every member loses its affiliation and every chair is told. If it fails, nothing changes. A coalition with many inactive chairs is therefore hard to dissolve; count your votes before you ally.

Five parties sit in the Liberty Alliance. The coalition chair opens a disband vote at turn 800. Three need to say yes (half of 5 is 2.5, so 3). By turn 810, two chairs vote yes, one votes no, and two have not voted. At turn 824 the vote is counted: 2 yes is below 3, so the coalition survives. Had a third chair voted yes at any point before turn 824, the coalition would have been disbanded at turn 824. Votes never end it early.

| Item | Value |
| --- | --- |
| Name length | 3 to 60 characters |
| Abbreviation length | 2 to 10 characters |
| Coalitions per party | 1 |
| Pending join requests per party | 1 |
| Disband vote length | 24 turns |
| Yes votes to disband | More than half of all members: 2 of 3, 3 of 4, 3 of 5 |
| Disband votes at once | 1 |

In parliamentary countries a coalition chair can propose a prime minister and the coalition's combined seats count toward that government's majority; see [Government Formation](/wiki/government-formation).

Live in every world and country that has parties. Bloc effects apply to US leadership races; parliamentary countries use coalitions in government formation. Last checked 2026-10-30, version 1.18.0. Exact rules: [Coalitions design page](https://docs.lakesidegames.net/design/coalitions.html)
`;
