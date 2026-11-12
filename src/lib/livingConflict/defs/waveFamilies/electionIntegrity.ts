import { ELECTION_INTEGRITY_KEY } from "../../rules/waveFamilyTables";
import { buildWaveFamilyDef } from "../waveFamilyFactory";

/** Doubts about votes and tailored feeds erode trust in election results. */
export const ELECTION_INTEGRITY_DEF = buildWaveFamilyDef({
  key: ELECTION_INTEGRITY_KEY,
  name: "Election Integrity Crisis",
  phases: {
    onset: {
      label: "Doubt spreads",
      summary: "Tailored feeds are pushing claims of rigging to different voters.",
      headline: "Waves of fake claims cast doubt on the voting system",
      body: "Voters see different stories about the same election and trust in the count is falling.",
    },
    peak: {
      label: "Legitimacy fight",
      summary: "Losing sides refuse to accept results and turnout is dropping.",
      headline: "Disputed results spark a fight over legitimacy",
      body: "Campaigns are filing challenges and some voters are staying home.",
    },
    recovery: {
      label: "Rebuilding trust",
      summary: "Audits and rule changes are restoring confidence in the count.",
      headline: "Audits and new rules rebuild trust in elections",
      body: "Disputes are moving through the courts and independent counts are being published.",
    },
    rested: {
      label: "Trust steadier",
      summary: "Confidence in results has recovered. Safeguards decide how long it holds.",
      headline: "Public trust in election results recovers",
      body: "Turnout is steadier. Governments can still decide how much to invest in election safeguards.",
    },
  },
  decision: {
    title: "Trust in the vote is slipping",
    description: "Doubts about the count are spreading. The government must decide how to respond.",
  },
  levers: {
    contain: {
      id: "platform_regulation",
      label: "Regulate platforms and political ads",
      description:
        "Require ad transparency, rapid takedown of proven fake claims and open data for researchers.",
      costPctGdp: 0.001,
    },
    soften: {
      id: "independent_audits",
      label: "Order independent audits",
      description: "Publish risk-limiting audits of every contest by cross-party panels.",
      costPctGdp: 0.002,
    },
    adapt: {
      id: "civic_education",
      label: "Fund civic and media education",
      description: "Pay for local news, schools and libraries that help voters check claims.",
      costPctGdp: 0.002,
    },
  },
  doNothing: {
    id: "defend_the_result",
    label: "Defend the result and move on",
    description: "Insist the count is fine and take no new steps.",
  },
  outcomes: {
    contained: {
      label: "Feeds cleaned up",
      description: "Transparency rules slow the spread of fake claims.",
      wire: "New platform rules slow the spread of fake election claims.",
    },
    softened: {
      label: "Count verified",
      description: "Independent audits confirm the count to doubters.",
      wire: "Independent audits confirm the result of a disputed election.",
    },
    adapted: {
      label: "Voters better informed",
      description: "Civic education helps voters judge claims for themselves.",
      wire: "Civic education helps voters judge election claims.",
    },
    unchecked: {
      onsetWire: "Fake claims about the vote keep spreading.",
      peakWire: "A fight over legitimacy deepens after a disputed election.",
      description: "Without action, doubts keep growing.",
    },
    aftermath: {
      label: "Safeguards locked in",
      description: "Standing audits and platform duties are set in law.",
      wire: "Governments set lasting election safeguards.",
    },
  },
  effects: [
    { category: "society", field: "democraticHealth", swing: -0.03, label: "Distrust of results" },
    { category: "social", field: "socialCohesion", swing: -0.01, label: "Bitter politics" },
    {
      category: "economy",
      field: "consumerConfidence",
      swing: -0.006,
      label: "Political uncertainty",
    },
  ],
  approvalSwing: -0.012,
});
