/** Legislative leans describe each policy option on economic and social axes.
 * v2VotePosition supplies the same positions to proposals, votes and enacted laws. */
import type { LawChoice } from "./eligibility";
import type { PolicyDomain } from "@/lib/archetypeAffinities";

type Axis = "economic" | "social";
interface PoliticalRoute {
  axis: Axis;
  domain: PolicyDomain;
  fallbackDomain?: PolicyDomain;
}

// Explicit family coverage: do not send an unfamiliar family to an economic default.
export const V2_POLITICAL_ROUTES: Readonly<Record<string, PoliticalRoute>> = {
  L01: { axis: "economic", domain: "welfare" },
  L02: { axis: "economic", domain: "welfare" },
  L03: { axis: "economic", domain: "economic" },
  L04: { axis: "economic", domain: "economic" },
  L05: { axis: "economic", domain: "economic" },
  L06: { axis: "economic", domain: "economic" },
  L07: { axis: "economic", domain: "economic" },
  L08: { axis: "economic", domain: "economic" },
  L09: { axis: "economic", domain: "economic" },
  L10: { axis: "economic", domain: "education" },
  L11: { axis: "economic", domain: "education" },
  L12: { axis: "economic", domain: "education" },
  L13: { axis: "economic", domain: "education" },
  L14: { axis: "economic", domain: "education" },
  L15: { axis: "economic", domain: "technology", fallbackDomain: "education" },
  L16: { axis: "economic", domain: "healthcare" },
  L17: { axis: "economic", domain: "healthcare" },
  L18: { axis: "economic", domain: "healthcare" },
  L19: { axis: "economic", domain: "healthcare" },
  L20: { axis: "economic", domain: "healthcare" },
  L21: { axis: "economic", domain: "healthcare" },
  L22: { axis: "economic", domain: "infrastructure" },
  L23: { axis: "economic", domain: "welfare" },
  L24: { axis: "economic", domain: "welfare" },
  L25: { axis: "economic", domain: "infrastructure" },
  L26: { axis: "economic", domain: "infrastructure" },
  L27: { axis: "economic", domain: "infrastructure" },
  L28: { axis: "economic", domain: "infrastructure" },
  L29: { axis: "economic", domain: "infrastructure" },
  L30: { axis: "economic", domain: "environment" },
  L31: { axis: "economic", domain: "environment" },
  L32: { axis: "economic", domain: "environment" },
  L33: { axis: "economic", domain: "environment" },
  L34: { axis: "social", domain: "criminal_justice" },
  L35: { axis: "social", domain: "criminal_justice" },
  L36: { axis: "economic", domain: "criminal_justice" },
  L37: { axis: "economic", domain: "agriculture", fallbackDomain: "economic" },
  L38: { axis: "economic", domain: "welfare" },
  L39: { axis: "economic", domain: "immigration" },
  L40: { axis: "economic", domain: "welfare" },
  L41: { axis: "economic", domain: "governance" },
  L42: { axis: "economic", domain: "infrastructure" },
  L43: { axis: "social", domain: "governance" },
  L44: { axis: "economic", domain: "governance" },
  L45: { axis: "economic", domain: "governance" },
  L46: { axis: "social", domain: "governance" },
  L47: { axis: "social", domain: "mediaInformation" },
  L48: { axis: "economic", domain: "economic" },
  L49: { axis: "social", domain: "immigration" },
  L50: { axis: "social", domain: "criminal_justice" },
  L51: { axis: "social", domain: "healthcare" },
  L52: { axis: "economic", domain: "immigration" },
};

const CHOICES = ["far_left", "center_left", "center", "center_right", "far_right"] as const;
const SCORES = [-5, -2.5, 0, 2.5, 5];

// Funding and delivery do not imply social conservatism. These positions follow
// the authored mechanisms rather than mechanically treating every final option as +5.
const AUTHORED_POSITIONS: Readonly<
  Record<string, readonly { economic?: number; social?: number }[]>
> = {
  L44: [-2, -1, 0, 0.5, 0].map((economic) => ({ economic })),
  L45: [-2, -1, 0, 1.5, 2].map((economic) => ({ economic })),
  L46: [
    { economic: -2.5, social: -5 },
    { economic: -1, social: -2.5 },
    { economic: 0, social: 0 },
    { economic: 1, social: -1 },
    { economic: 1.5, social: -2.5 },
  ],
  L47: [
    { economic: -5, social: -2.5 },
    { economic: -2.5, social: -1 },
    { economic: 0, social: 0 },
    { economic: 1, social: 0 },
    { economic: 2.5, social: -1 },
  ],
};

export interface V2PoliticalProvision {
  familyId: string;
  choice: LawChoice;
  currentChoiceSnapshot: LawChoice;
}

/** Federalism is not an ideology rung; leave_to_states has no invented axis position. */
export function v2VotePosition(
  provision: Pick<V2PoliticalProvision, "familyId" | "choice">
): { economic?: number; social?: number; includeNeutral: true } | null {
  const route = V2_POLITICAL_ROUTES[provision.familyId];
  const index = CHOICES.findIndex((choice) => choice === provision.choice);
  if (!route || index < 0) return null;
  const authored = AUTHORED_POSITIONS[provision.familyId];
  return { ...(authored?.[index] ?? { [route.axis]: SCORES[index] }), includeNeutral: true };
}
