/**
 * Opening program spending for the US, the UK, Germany, Japan and China, per preset. It sets the
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
  "JP|2020|550000000000000|126000000": {
    all: {
      byCategory: {
        healthcare: 53219250000000,
        education: 14008680000000.002,
        defense: 10275092100000,
        economic: 11124540000000,
        infrastructure: 10300500000000,
        environment: 6523650000000,
        social: 9586332000000,
        immigration: 652365000000,
        agriculture: 2664396000000,
        governance: 988848000000,
        foreign_policy: 2128770000000.0002,
        technology: 2472120000000,
        publicSafety: 2595726000000,
      },
      stateGrants: 17579520000000.002,
    },
  },
  "JP|1979|230000000000000|115900000": {
    all: {
      byCategory: {
        healthcare: 23513829787234.04,
        education: 6189446808510.638,
        defense: 4539837872340.425,
        economic: 4915148936170.212,
        infrastructure: 4551063829787.233,
        environment: 2882340425531.9146,
        social: 4235523404255.3184,
        immigration: 288234042553.19147,
        agriculture: 1177208510638.2979,
        governance: 436902127659.57446,
        foreign_policy: 940553191489.3616,
        technology: 1092255319148.936,
        publicSafety: 1146868085106.3828,
      },
      stateGrants: 7767148936170.212,
    },
  },
  "JP|1991|470000000000000|124000000": {
    all: {
      byCategory: {
        healthcare: 48050000000000,
        education: 12400000000000,
        defense: 7665060000000,
        economic: 9957200000000,
        infrastructure: 8866000000000,
        environment: 5332000000000,
        social: 6572000000000,
        immigration: 316200000000,
        agriculture: 2405600000000,
        governance: 843200000000,
        foreign_policy: 1810400000000,
        technology: 2232000000000,
        publicSafety: 2070800000000,
      },
      stateGrants: 15872000000000,
    },
    active: {
      byCategory: {
        healthcare: 48050000000000,
        education: 11780000000000,
        defense: 7441860000000,
        economic: 9957200000000,
        infrastructure: 8432000000000,
        environment: 5332000000000,
        social: 6572000000000,
        immigration: 217000000000,
        agriculture: 2405600000000,
        governance: 620000000000,
        foreign_policy: 1810400000000,
        technology: 1760800000000,
        publicSafety: 2070800000000,
      },
      stateGrants: 15872000000000,
    },
  },
  "JP|1999|470000000000000|124000000": {
    all: {
      byCategory: {
        healthcare: 48050000000000,
        education: 12400000000000,
        defense: 7665060000000,
        economic: 9957200000000,
        infrastructure: 8866000000000,
        environment: 5332000000000,
        social: 6572000000000,
        immigration: 316200000000,
        agriculture: 2405600000000,
        governance: 843200000000,
        foreign_policy: 1810400000000,
        technology: 2232000000000,
        publicSafety: 2070800000000,
      },
      stateGrants: 15872000000000,
    },
  },
  "JP|2007|470000000000000|124000000": {
    all: {
      byCategory: {
        healthcare: 48050000000000,
        education: 12400000000000,
        defense: 7665060000000,
        economic: 9957200000000,
        infrastructure: 8866000000000,
        environment: 5332000000000,
        social: 6572000000000,
        immigration: 316200000000,
        agriculture: 2405600000000,
        governance: 843200000000,
        foreign_policy: 1810400000000,
        technology: 2232000000000,
        publicSafety: 2070800000000,
      },
      stateGrants: 15872000000000,
    },
  },
  "JP|2023|550000000000000|126000000": {
    all: {
      byCategory: {
        healthcare: 53219250000000,
        education: 14008680000000.002,
        defense: 10275092100000,
        economic: 11124540000000,
        infrastructure: 10300500000000,
        environment: 6523650000000,
        social: 9586332000000,
        immigration: 652365000000,
        agriculture: 2664396000000,
        governance: 988848000000,
        foreign_policy: 2128770000000.0002,
        technology: 2472120000000,
        publicSafety: 2595726000000,
      },
      stateGrants: 17579520000000.002,
    },
  },
  "JP|2027|707674393000000|126000000": {
    all: {
      byCategory: {
        healthcare: 53219250000000,
        education: 14008680000000.002,
        defense: 10275092100000,
        economic: 11124540000000,
        infrastructure: 10300500000000,
        environment: 6523650000000,
        social: 9586332000000,
        immigration: 652365000000,
        agriculture: 2664396000000,
        governance: 988848000000,
        foreign_policy: 2128770000000.0002,
        technology: 2472120000000,
        publicSafety: 2595726000000,
      },
      stateGrants: 17579520000000.002,
    },
  },
  "JP|2027|707674393000000|121998578": {
    all: {
      byCategory: {
        healthcare: 51529149382750,
        education: 13563801902040,
        defense: 9948782738246.3,
        economic: 10771254451620,
        infrastructure: 9973383751500,
        environment: 6316476375950,
        social: 9281895811396,
        immigration: 631647637595,
        agriculture: 2579781930388,
        governance: 957444840144,
        foreign_policy: 2061165975310.0002,
        technology: 2393612100360,
        publicSafety: 2513292705378,
      },
      stateGrants: 17021241602560.002,
    },
  },
  "CN|2023|126000000000000|1412000000": {
    all: {
      byCategory: {
        health: 2199896000000,
        education: 4100448000000,
        socialSecurity: 3899944000000,
        defense: 1620976000000,
        infrastructure: 3500348000000,
        other: 3138876000000,
        publicSafety: 2300148000000,
        agriculture: 2401812000000,
      },
      stateGrants: 0,
    },
  },
  "CN|1979|559000000000|977000000": {
    all: {
      byCategory: {
        health: 9262883269.605143,
        education: 17265348533.333332,
        socialSecurity: 16421106284.113865,
        defense: 6825282409.182736,
        infrastructure: 14738567153.62718,
        other: 13216552957.85124,
        publicSafety: 9685004394.214876,
        agriculture: 10113070886.77686,
      },
      stateGrants: 0,
    },
  },
  "CN|1991|2178000000000|1158230000": {
    all: {
      byCategory: {
        health: 36090446800,
        education: 67269998400,
        socialSecurity: 62011634200,
        defense: 27079417400,
        infrastructure: 72180893600,
        other: 50174523600,
        publicSafety: 22631814200,
        agriculture: 39402984600,
      },
      stateGrants: 0,
    },
  },
  "CN|1999|2178000000000|1158230000": {
    all: {
      byCategory: {
        health: 36090446800,
        education: 67269998400,
        socialSecurity: 62011634200,
        defense: 27079417400,
        infrastructure: 72180893600,
        other: 50174523600,
        publicSafety: 22631814200,
        agriculture: 39402984600,
      },
      stateGrants: 0,
    },
  },
  "CN|2007|2178000000000|1158230000": {
    all: {
      byCategory: {
        health: 36090446800,
        education: 67269998400,
        socialSecurity: 62011634200,
        defense: 27079417400,
        infrastructure: 72180893600,
        other: 50174523600,
        publicSafety: 22631814200,
        agriculture: 39402984600,
      },
      stateGrants: 0,
    },
  },
  "CN|2027|155565148879000|1412000000": {
    all: {
      byCategory: {
        health: 2199896000000,
        education: 4100448000000,
        socialSecurity: 3899944000000,
        defense: 1620976000000,
        infrastructure: 3500348000000,
        other: 3138876000000,
        publicSafety: 2300148000000,
        agriculture: 2401812000000,
      },
      stateGrants: 0,
    },
  },
  "CN|2027|155565148879000|1398524090": {
    all: {
      byCategory: {
        health: 2178900532220,
        education: 4061313957360,
        socialSecurity: 3862723536580,
        defense: 1605505655320,
        infrastructure: 3466941219110,
        other: 3108919052070,
        publicSafety: 2278195742610,
        agriculture: 2378889477090,
      },
      stateGrants: 0,
    },
  },
  "DE|2020|4500000000000|84400000": {
    all: {
      byCategory: {
        environment: 54868440000,
        welfare: 678373440000,
        healthcare: 614692796000,
        education: 211160360000,
        defense: 89784720000,
        other: 229449840000,
        transport: 48217720000,
      },
      stateGrants: 0,
    },
  },
  "DE|1979|1254000000000|61400000": {
    all: {
      byCategory: {
        environment: 13510229104,
        welfare: 167035559829,
        healthcare: 151355506051,
        education: 51993912006,
        defense: 22107647624,
        other: 56497321707,
        transport: 11872625576,
      },
      stateGrants: 0,
    },
  },
  "DE|1991|1600000000000|80000000": {
    all: {
      byCategory: {
        environment: 25480000000,
        welfare: 211120000000,
        healthcare: 192244000000,
        education: 51480000000,
        defense: 28080000000,
        other: 140088000000,
        transport: 16120000000,
      },
      stateGrants: 0,
    },
  },
  "DE|1999|1600000000000|80000000": {
    all: {
      byCategory: {
        environment: 25480000000,
        welfare: 211120000000,
        healthcare: 192244000000,
        education: 51480000000,
        defense: 28080000000,
        other: 140088000000,
        transport: 16120000000,
      },
      stateGrants: 0,
    },
  },
  "DE|2007|1600000000000|80000000": {
    all: {
      byCategory: {
        environment: 25480000000,
        welfare: 211120000000,
        healthcare: 192244000000,
        education: 51480000000,
        defense: 28080000000,
        other: 140088000000,
        transport: 16120000000,
      },
      stateGrants: 0,
    },
  },
  "DE|2023|4500000000000|84400000": {
    all: {
      byCategory: {
        environment: 54868440000,
        welfare: 678373440000,
        healthcare: 614692796000,
        education: 211160360000,
        defense: 89784720000,
        other: 229449840000,
        transport: 48217720000,
      },
      stateGrants: 0,
    },
  },
  "DE|2027|4881139000000|84400000": {
    all: {
      byCategory: {
        environment: 54868440000,
        welfare: 678373440000,
        healthcare: 614692796000,
        education: 211160360000,
        defense: 89784720000,
        other: 229449840000,
        transport: 48217720000,
      },
      stateGrants: 0,
    },
  },
  "DE|2027|4881139000000|83140237": {
    all: {
      byCategory: {
        environment: 54049468074,
        welfare: 668247968911,
        healthcare: 605517828692,
        education: 208008558950,
        defense: 88444584121,
        other: 226025048308,
        transport: 47498017398,
      },
      stateGrants: 0,
    },
  },
};
