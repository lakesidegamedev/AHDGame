/**
 * Opening program spending for the US and the UK, per preset. It sets the
 * envelope the first budget refresh calibrates non-law spending against.
 * Keys are `country|fiscalYear|gdp|population`, so a re-based config never reads
 * a mismatched row. `all` is every national spending program; `active` is the
 * subset active in the fiscal year. No row falls back to the authored baseline.
 */
export interface OpeningProgramSpending {
  byCategory: Readonly<Record<string, number>>;
  stateGrants: number;
}

export const OPENING_PROGRAM_SPENDING: Readonly<
  Record<string, { all?: OpeningProgramSpending; active?: OpeningProgramSpending }>
> = {
  "US|2020|27000000000000|333000000": {
    all: {
      byCategory: {
        education: 321834510000,
        healthcare: 1301294070000,
        other: 1606635090000,
        infrastructure: 268970760000,
        defense: 892340100000,
        socialSecurity: 640708650000,
      },
      stateGrants: 0,
    },
  },
  "UK|2020|2900000000000|68000000": {
    all: {
      byCategory: {
        healthcare: 222839400000,
        education: 129876600000,
        economic: 57976800000,
        infrastructure: 39841200000,
        environment: 21277200000,
        publicSafety: 14922600000,
        defense: 60047400000,
        social: 176143800000,
      },
      stateGrants: 65688000000,
    },
  },
  "US|1979|2632000000000|225000000": {
    all: {
      byCategory: {
        education: 38346457626.580635,
        healthcare: 98820812493.29031,
        other: 144136433691.87094,
        infrastructure: 20425751298.580643,
        defense: 67764678050.32257,
        socialSecurity: 48655681159.354836,
      },
      stateGrants: 0,
    },
  },
  "UK|1979|245000000000|56200000": {
    all: {
      byCategory: {
        healthcare: 22716328541.666664,
        education: 13239667291.666664,
        economic: 5910175833.333333,
        infrastructure: 4061426249.9999995,
        environment: 2169005416.6666665,
        publicSafety: 1521215208.3333333,
        defense: 6121253541.666666,
        social: 17956162291.666664,
      },
      stateGrants: 6696258333.333333,
    },
  },
  "US|1991|6200000000000|252177000": {
    all: {
      byCategory: {
        education: 54243272700,
        healthcare: 232784588700,
        other: 241787307600,
        infrastructure: 64153828800,
        defense: 159628041000,
        socialSecurity: 114614446500,
      },
      stateGrants: 0,
    },
    active: {
      byCategory: {
        education: 54243272700,
        healthcare: 232784588700,
        other: 143438277600,
        infrastructure: 48115371600,
        defense: 159628041000,
        socialSecurity: 114614446500,
      },
      stateGrants: 0,
    },
  },
  "UK|1991|600000000000|57500000": {
    all: {
      byCategory: {
        healthcare: 55631825000,
        education: 31621550000,
        economic: 14473900000,
        infrastructure: 6684375000,
        environment: 3743250000,
        publicSafety: 3725425000,
        defense: 14990825000,
        social: 41728325000,
      },
      stateGrants: 16399000000,
    },
    active: {
      byCategory: {
        healthcare: 55631825000,
        education: 31621550000,
        economic: 14473900000,
        infrastructure: 6559600000,
        environment: 3743250000,
        publicSafety: 3725425000,
        defense: 14990825000,
        social: 41728325000,
      },
      stateGrants: 16399000000,
    },
  },
  "US|1999|9660000000000|279000000": {
    all: {
      byCategory: {
        education: 157350144101.03217,
        healthcare: 405499491958.85767,
        other: 421181792752.8466,
        infrastructure: 83814649621.65533,
        defense: 200970661435.57294,
        socialSecurity: 199652821032.7167,
      },
      stateGrants: 0,
    },
  },
  "UK|1999|600000000000|57500000": {
    all: {
      byCategory: {
        healthcare: 55631825000,
        education: 31621550000,
        economic: 14473900000,
        infrastructure: 6684375000,
        environment: 3743250000,
        publicSafety: 3725425000,
        defense: 14990825000,
        social: 41728325000,
      },
      stateGrants: 16399000000,
    },
  },
  "US|2007|14450000000000|301200000": {
    all: {
      byCategory: {
        education: 151512975177.8296,
        healthcare: 650216770742.2338,
        other: 675363275688.066,
        infrastructure: 111997038834.3789,
        defense: 445875003661.3953,
        socialSecurity: 320142478932.2341,
      },
      stateGrants: 0,
    },
  },
  "UK|2007|600000000000|57500000": {
    all: {
      byCategory: {
        healthcare: 55631825000,
        education: 31621550000,
        economic: 14473900000,
        infrastructure: 6684375000,
        environment: 3743250000,
        publicSafety: 3725425000,
        defense: 14990825000,
        social: 41728325000,
      },
      stateGrants: 16399000000,
    },
  },
  "US|2023|27400000000000|334900000": {
    all: {
      byCategory: {
        education: 507835662000,
        healthcare: 1912252208000,
        other: 1872271846000,
        infrastructure: 414689925000,
        defense: 897431530000,
        socialSecurity: 644364345000,
      },
      stateGrants: 0,
    },
  },
  "UK|2023|2900000000000|68000000": {
    all: {
      byCategory: {
        healthcare: 222839400000,
        education: 129876600000,
        economic: 57976800000,
        infrastructure: 39841200000,
        environment: 21277200000,
        publicSafety: 14922600000,
        defense: 60047400000,
        social: 176143800000,
      },
      stateGrants: 65688000000,
    },
  },
  "UK|2027|3272374000000|68000000": {
    all: {
      byCategory: {
        healthcare: 222839400000,
        education: 129876600000,
        economic: 57976800000,
        infrastructure: 39841200000,
        environment: 21277200000,
        publicSafety: 14922600000,
        defense: 60047400000,
        social: 176143800000,
      },
      stateGrants: 65688000000,
    },
  },
  "US|2027|32800000000000|341784857": {
    all: {
      byCategory: {
        education: 518275721457.66003,
        healthcare: 1951564190681.44,
        other: 1910761914452.7803,
        infrastructure: 423215099180.25,
        defense: 915880881302.9,
        socialSecurity: 657611154110.85,
      },
      stateGrants: 0,
    },
  },
  "UK|2027|3272374000000|70106549": {
    all: {
      byCategory: {
        healthcare: 229742666400.44998,
        education: 133900003262.55002,
        economic: 59772843677.4,
        infrastructure: 41075427059.100006,
        environment: 21936339182.100002,
        publicSafety: 15384882178.050001,
        defense: 61907588094.45,
        social: 181600499202.15,
      },
      stateGrants: 67722926334,
    },
  },
};
