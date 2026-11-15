/**
 * 1990 JP regional vote share (%) from the 1990 Shugiin general election,
 * mapped to the game's 8 regions. Used by `calculateJPStatePartyOrgs` for
 * the `1991-default` preset.
 *
 * Parties reflect 1990, not 2021: opposition is JSP (not CDP), centrist
 * analogue is DSP (not DPFP), and no `ishin` entry exists; Kansai share
 * redistributes to LDP/JSP/Komeito/DSP. Komeito uses the `komeito` slug
 * for engine compatibility.
 */

export const JP_REGION_VOTE_SHARES_1990: Record<string, Record<string, number>> = {
  HOK: { ldp: 44, jsp: 24, komeito: 5, jcp: 7, dsp: 4 },
  TOH: { ldp: 50, jsp: 28, komeito: 6, jcp: 5, dsp: 3 },
  KAN: { ldp: 40, jsp: 24, komeito: 12, jcp: 12, dsp: 5 },
  CHU: { ldp: 48, jsp: 22, komeito: 8, jcp: 8, dsp: 4 },
  KNS: { ldp: 42, jsp: 22, komeito: 12, jcp: 10, dsp: 7 },
  CGK: { ldp: 50, jsp: 24, komeito: 7, jcp: 7, dsp: 4 },
  SHI: { ldp: 52, jsp: 24, komeito: 6, jcp: 6, dsp: 4 },
  KYU: { ldp: 48, jsp: 22, komeito: 8, jcp: 8, dsp: 4 },
};

export default JP_REGION_VOTE_SHARES_1990;
