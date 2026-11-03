/** Prop shapes shared by the navbar and the lazily loaded mobile menu body. */

export interface NavbarUser {
  username: string;
  isAdmin?: boolean;
  isModerator?: boolean;
  singleplayer?: boolean;
  canSeeCampaignManager?: boolean;
  patreonTier?: string | null;
  isPatronActive?: boolean;
  sandboxTesterAccess?: boolean;
}

export interface AdminCharacter {
  id: string;
  name: string;
  countryId: string;
  party: string | null;
  isActive: boolean;
}

export interface ImperialCharacterNav {
  id: string;
  name: string;
  countryId: string;
  royalHouse: string;
}

export interface NavbarHomeState {
  id: string;
  name: string;
  countryId: string;
}

export interface NavbarCurrentParty {
  id: string;
  name: string;
  countryId: string;
}

export interface NavbarActiveElection {
  id: string;
  seatId?: string;
  label: string;
}

export interface NavbarCabinetOffice {
  positionId: string;
  positionName: string;
  countryCode: string;
}

export interface NavbarJusticeOffice {
  countryCode: string;
  seatNumber: number;
}

export interface NavbarGovernorOffice {
  stateId: string;
  stateName: string;
  countryCode: string;
}
