/** Rows the party-election heal diagnosis returns, shared by the route and its admin panel. */
export interface StateElectionIssue {
  _id: string;
  type: "state";
  stateId: string;
  partyId: string;
  position: string;
  status: string;
  hasStartTurn: boolean;
  hasEndTurn: boolean;
  hasDurationTurns: boolean;
}

export interface NationalElectionIssue {
  _id: string;
  type: "national";
  partyId: string;
  countryId: string;
  position: string;
  status: string;
  hasStartTurn: boolean;
  hasEndTurn: boolean;
  hasDurationTurns: boolean;
  hasCountryId: boolean;
}

export interface CommitteeElectionIssue {
  _id: string;
  type: "committee";
  partyId: string;
  countryId: string;
  status: string;
  hasStartTurn: boolean;
  hasEndTurn: boolean;
  hasDurationTurns: boolean;
  hasCountryId: boolean;
}

export type ElectionIssue = StateElectionIssue | NationalElectionIssue | CommitteeElectionIssue;
