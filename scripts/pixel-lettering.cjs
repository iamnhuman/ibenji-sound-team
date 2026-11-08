'use strict';

const referenceLettering = require('./reference-lettering.cjs');

const brushLabel = {
  height: 14, slant: .15, pixelGrid: true,
  glyphs: {
    S: { advance: 12.4, contours: [[[.3, 11.9], [2.3, 9.3], [3.9, 10.5], [7.5, 10.1], [8.2, 9.0],
      [3.0, 7.3], [1.6, 5.3], [2.1, 2.6], [4.8, 1.1], [11.5, .4], [10.0, 3.3], [5.4, 3.7],
      [4.8, 4.7], [10.1, 6.3], [11.1, 8.4], [10.1, 11.3], [7.7, 12.8], [2.5, 13.7]]] },
    O: { advance: 13.4, contours: [[[1.0, 4.5], [3.5, 1.2], [9.7, .5], [12.2, 2.5], [12.1, 8.6],
      [9.1, 12.7], [3.6, 13.7], [.6, 11.1]], [[4.1, 5.2], [3.5, 9.2], [4.6, 10.4], [7.6, 9.9],
      [9.1, 7.9], [9.1, 4.3], [8.1, 3.6], [5.5, 3.8]]] },
    U: { advance: 12.5, contours: [[[1.1, 2.0], [4.5, .7], [3.3, 8.6], [4.5, 10.2], [7.3, 9.5],
      [8.9, 1.6], [12.1, .2], [10.6, 9.8], [8.5, 12.4], [3.1, 13.8], [.3, 11.2]]] },
    N: { advance: 13.0, contours: [[[.1, 13.6], [1.5, 1.8], [4.4, .6], [8.2, 7.5], [9.3, 1.9],
      [12.2, .8], [10.7, 12.7], [7.9, 13.5], [4.0, 6.4], [3.0, 12.5]]] },
    D: { advance: 13.7, contours: [[[.0, 13.3], [1.8, 1.6], [8.2, .7], [11.5, 2.0], [12.4, 4.7],
      [11.6, 8.6], [8.4, 12.0]], [[4.5, 4.1], [3.6, 10.0], [6.6, 9.4], [8.6, 7.6], [9.1, 4.8], [7.8, 3.6]]] },
    ' ': { advance: 6.6, contours: [] },
    T: { advance: 11.7, contours: [[[.4, 1.8], [11.8, .4], [10.4, 3.3], [7.0, 3.8], [5.7, 12.4],
      [2.3, 13.6], [3.7, 4.2], [.0, 4.8]]] },
    E: { advance: 11.8, contours: [[[.4, 13.8], [2.0, 1.7], [11.3, .6], [10.5, 3.6], [4.8, 4.1],
      [4.5, 5.8], [9.7, 5.2], [8.8, 8.0], [4.2, 8.7], [3.8, 10.5], [10.3, 9.7], [9.2, 12.4]]] },
    A: { advance: 13.3, contours: [[[0, 13.6], [5.0, 1.9], [8.9, .5], [12.0, 12.4], [8.9, 13.5],
      [8.1, 10.3], [4.1, 11.0], [3.0, 13.1]], [[5.2, 8.1], [7.6, 7.7], [6.9, 4.5]]] },
    M: { advance: 15.7, contours: [[[0, 13.9], [1.9, 1.9], [4.6, .8], [7.5, 5.4], [11.1, 1.3],
      [14.5, .5], [13.4, 12.2], [10.2, 13.2], [10.9, 6.5], [6.9, 10.2], [4.2, 6.6], [3.2, 12.7]]] }
  }
};
const terminalName = {
  i: '03330/01110/00000/31110/00110/00110/00110/00110/00110/11111/02222/00000',
  B: '03333333300/11111111110/11100001110/11100001110/11133333300/11111111110/11100001111/11100001111/11100001111/11111111110/02222222200/00000000000',
  e: '0000000000/0000000000/0000000000/0033333300/0111111110/1110000111/1113333111/1111111110/1110000000/0111111110/0022222220/0000000000',
  n: '0000000000/0000000000/0000000000/3303333300/1111111110/1110001110/1110000111/1110000111/1110000111/1110000111/0220000222/0000000000',
  j: '000333/000111/000000/003333/000111/000111/000111/000111/000111/100111/111110/222200'
};
const terminalLabel = {
  S: '01111/11000/11000/01110/00011/00011/11110', O: '011110/110011/110011/110011/110011/110011/011110',
  U: '110011/110011/110011/110011/110011/110011/011110', N: '110001/111001/111001/110101/110111/110011/110011',
  D: '111100/110010/110011/110011/110011/110010/111100', T: '111111/001100/001100/001100/001100/001100/001100',
  E: '11111/11000/11000/11110/11000/11000/11111', A: '001100/011110/110011/110011/111111/110011/110011',
  M: '1100011/1110111/1110111/1101011/1100011/1100011/1100011', ' ': '000/000/000/000/000/000/000'
};
const neuralFooterSide = [[0, 3], [1.5, 3], [1.5, 6.6], [13.6, 6.6], [20.5, 12.8], [34.5, 12.8],
  [40.2, 17.8], [38.4, 17.8], [33.8, 14.3], [20.0, 14.3], [13.0, 8.1], [1.5, 8.1], [1.5, 13.3], [0, 13.3]];
const neuralFooter = {
  height: 28, pixelGrid: true,
  glyphs: {
    '-': { advance: 128, contours: [
      neuralFooterSide, neuralFooterSide.map(([x, y]) => [128 - x, y]),
      [[8, 1.6], [52, 1.6], [52, 3.1], [8, 3.1]], [[76, 1.6], [120, 1.6], [120, 3.1], [76, 3.1]],
      ...[[46, 1.5], [49.5, 2.1], [54, 1.4], [57.3, 2.4], [61.7, 1.3],
        [65.3, 1.6], [69.1, 1.7], [72.9, 2.6], [77.5, 1.4], [81, 1.6]].map(([x, w]) =>
        [[x, 11.6], [x + w, 11.6], [x + w, 18.3], [x, 18.3]]),
      [[44, 20.4], [62, 20.4], [63.2, 19.2], [64, 17.5], [64.8, 19.2], [66, 20.4], [84, 20.4],
        [84, 21.9], [66.2, 21.9], [64.9, 23.4], [64, 27.9], [63.1, 23.4], [61.8, 21.9], [44, 21.9]]
    ] }
  }
};
const brushStroke = {
  height: 9,
  glyphs: {
    '-': { advance: 132, contours: [
      [[0, 7], [9, 5], [29, 4], [49, 2], [70, 3], [96, 1], [132, 0], [120, 3], [98, 4], [72, 6],
        [45, 5], [26, 7], [12, 7], [4, 9]],
      [[62, 8], [84, 7], [108, 5], [122, 5], [114, 7], [91, 9], [64, 9]]
    ] }
  }
};
const toriiLabel = {
  S: '001111/011100/001110/000111/111110', O: '001110/011011/110011/110110/011100',
  U: '110011/110011/110011/110110/011100', N: '110001/111001/111101/110111/110011',
  D: '111100/110110/110011/110110/111100', T: '011111/001100/001100/001100/011000',
  E: '011111/110000/111110/110000/111110', A: '001110/011110/110011/111111/110011',
  M: '1100011/1110111/1111111/1101011/1100011'
};
const scannerName = {
  i: '011110/111110/000000/001110/001110/001110/001110/000000',
  B: '01111111100/11111111110/11100001110/11111111100/11100001111/11100001111/11111111110/00000000000',
  e: '0000000000/0000000000/0111111110/1110001111/1111111111/1110000000/0111111110/0000000000',
  n: '0000000000/0000000000/1111111100/1111111110/1111001110/1111001110/1111001110/0000000000',
  j: '00111110/01111110/00000000/00011100/00011100/00011100/00111100/11111000'
};
const orbitLabel = {
  S: '0111/1000/0110/0001/1110', O: '111/101/101/101/111', U: '101/101/101/101/111',
  N: '1001/1101/1101/1011/1001', D: '110/101/101/101/110', T: '111/010/010/010/010',
  E: '111/100/111/100/111', A: '111/101/111/101/101', M: '10001/11011/10101/10101/10001'
};
const registered = {
  '®': '001111100/010000010/101110001/101001001/101110001/101010001/101001001/010000010/001111100'
};
const chromaName = {
  i: '3110/1112/0000/3110/1112/1112/1112/1112/1112/0220/0000',
  B: '3111111000/1111111120/1110001110/1110001120/1111111200/1111111120/1110001112/1110001112/1111111120/0222222000/0000000000',
  e: '000000000/000000000/000000000/031111100/311111112/111000112/111111120/111000000/011111112/002222220/000000000',
  n: '000000000/000000000/000000000/310111100/111111112/111100112/111000112/111000112/111000112/022000220/000000000',
  j: '0003110/0001112/0000000/0003110/0001112/0001112/0001112/0001112/3101112/1111120/0222200'
};
const forge = {
  i: ['00111', '01110', '11100', '00000', '01110', '11110', '11110', '11110', '11110', '11100', '11000', '00000', '00000'],
  B: ['011111111000', '111111111100', '111111111110', '111000011110', '111000011100', '111111111000', '111111111100',
    '111000001110', '111000001111', '111000001110', '111111111100', '111111111000', '000000000000'],
  e: ['0000000000', '0000000000', '0000000000', '0011111100', '0111111110', '1111001111', '1111111111',
    '1111000000', '1110000000', '1111111110', '0111111110', '0011111100', '0000000000'],
  n: ['0000000000', '0000000000', '0000000000', '1111111000', '1111111100', '1111111110', '1110011111',
    '1110001111', '1110001111', '1110001111', '1110001110', '1110001110', '0000000000'],
  j: ['00000111', '00001110', '00011100', '00000000', '00011110', '00011110', '00011110',
    '00011110', '00011110', '00011110', '01111100', '11111000', '11110000']
};
const forgeLabel = {
  S: '01111/11000/01110/00011/11110', O: '01110/11011/11011/11011/01110', U: '11011/11011/11011/11011/01110',
  N: '11001/11101/11111/11011/11001', D: '11110/11011/11011/11011/11110', T: '11111/00100/00100/00100/00100',
  E: '11111/11000/11110/11000/11111', A: '01110/11011/11111/11011/11011', M: '11011/11111/10101/10001/10001'
};
const ringName = {
  I: '0111110/1111110/0011000/0011000/0011000/0011000/0011000/0011000/1111110/1111120/2222200',
  B: '01111111100/11111111110/11100001110/11100001110/11111111100/11111111110/11100000111/11100000111/11111111110/11111111200/22222222000',
  E: '011111111/111111110/111000000/111000000/111111100/111111000/111000000/111000000/111111111/111111120/222222200',
  N: '111000111/111100111/111100111/111110111/111110111/111111111/111011111/111001111/111001111/112000112/220000220',
  J: '000111111/000111111/000000111/000000111/000000111/000000111/110000111/111000111/011111111/001111120/000222200'
};
const ringLabel = {
  S: '01111/11000/11110/00011/11110/02220', O: '01110/11011/11011/11011/01110/00200',
  U: '11011/11011/11011/11011/01110/00200', N: '11011/11111/11111/11011/11011/22022',
  D: '11110/11011/11011/11011/11110/22200', T: '11111/00100/00100/00100/00100/00200',
  E: '11111/11000/11110/11000/11111/22220', A: '01110/11011/11111/11011/11011/22022',
  M: '110011/111111/110011/110011/110011/220022'
};
const umbrellaName = {
  I: '0111/1111/1111/1111/1111/1111/1111/1111/1110',
  B: '011111110/111111111/111000111/111000111/111111110/111000111/111000111/111111111/111111110',
  E: '01111111/11111111/11100000/11100000/11111110/11100000/11100000/11111111/01111111',
  N: '111000111/111100111/111100111/111110111/111111111/111011111/111001111/111000111/111000111',
  J: '000001111/000001111/000001111/000001111/000001111/000001111/111001111/111111110/011111100'
};
const sprint = {
  height: 22,
  slant: .32,
  pixelGrid: true,
  glyphs: {
    i: { advance: 8.9, contours: [
      [[1.8, 0], [7.25, 0], [5.65, 3.7], [.25, 3.7]],
      [[2, 5.65], [6.55, 5.65], [6.55, 15.45], [4.85, 18.25], [.65, 18.25], [.65, 7.25]]
    ] },
    B: { advance: 19.9, contours: [
      [[2.8, 0], [15.2, 0], [18.7, 2.7], [18.7, 5.85], [16.1, 8.5], [18.9, 10.95],
        [18.9, 14.35], [15.8, 17.45], [13.8, 18.25], [0, 18.25], [0, 2.8]],
      [[5.4, 3.6], [12.9, 3.6], [13.95, 4.8], [12.1, 7.2], [5.4, 7.2]],
      [[5.4, 10.65], [13.15, 10.65], [14.05, 12.35], [12.3, 14.8], [5.4, 14.8]]
    ] },
    e: { advance: 16.9, contours: [
      [[4.3, 5], [12.95, 5], [15.55, 7.75], [15.55, 10.05], [13.85, 11.7], [4.75, 11.7], [4.75, 13.65],
        [5.9, 14.8], [15.55, 14.8], [12.45, 18.25], [3.2, 18.25], [0, 15.15], [0, 8.85]],
      [[4.75, 9.25], [4.75, 8.75], [6, 7.75], [10.3, 7.75], [11.45, 8.45], [11.45, 9.25]]
    ] },
    n: { advance: 17.3, contours: [
      [[1.75, 5], [4.2, 5], [5.05, 6.2], [6.85, 5], [12.6, 5], [15.65, 8.15], [15.65, 16.4], [14.35, 18.25],
        [10.7, 18.25], [10.7, 9.6], [9.6, 8.55], [6.1, 8.55], [4.95, 9.65], [4.95, 16.65], [3.4, 18.25], [0, 18.25], [0, 6.9]]
    ] },
    j: { advance: 11.6, contours: [
      [[6.35, 0], [10.9, 0], [9.35, 3.7], [4.75, 3.7]],
      [[6.1, 5.65], [10.15, 5.65], [10.15, 17.6], [6.15, 22], [0, 22],
        [1.3, 18.75], [3.1, 18.75], [4.75, 17.1], [4.75, 7.25]]
    ] }
  }
};
const aphex = {
  height: 17.5,
  glyphs: {
    i: { advance: 12.4, contours: [
      [[1.35, .2], [10.4, .2], [11.55, 1.15], [11.55, 2.3], [10.4, 3.2], [1.35, 3.2], [0, 2.25], [0, 1.2]],
      [[1.25, 5.25], [10.35, 5.25], [10.35, 7.45], [7.4, 7.45], [7.4, 13.25], [6.25, 14.65],
        [2.45, 14.65], [1.25, 13.45]]
    ] },
    B: { advance: 22.7, contours: [
      [[1.9, 0], [15.8, 0], [18.55, .75], [20.25, 2.15], [20.6, 4.05], [19.55, 5.5], [17.3, 6.6], [19.95, 7.55],
        [21.1, 9.25], [21.1, 11.5], [19.85, 13.4], [17.5, 14.65], [1.9, 14.65], [0, 13.3], [0, 1.3]],
      [[5.75, 2.95], [15.6, 2.95], [16.85, 3.65], [16.85, 4.45], [15.65, 5.2], [5.75, 5.2]],
      [[5.75, 8.85], [16.75, 8.85], [17.95, 9.55], [17.95, 10.55], [16.75, 11.6], [5.75, 11.6]]
    ] },
    e: { advance: 22.2, contours: [
      [[3.95, 4.45], [17.6, 4.45], [19.65, 5.5], [20.65, 7.05], [20.65, 10.25], [5.55, 10.25],
        [5.55, 11.55], [6.65, 12.3], [20.65, 12.3], [19.95, 13.65], [18.35, 14.65], [3.7, 14.65],
        [1.2, 13.35], [0, 11.45], [0, 7.1], [1.2, 5.65]],
      [[5.6, 7.1], [15.45, 7.1], [16.55, 7.8], [16.55, 8.6], [5.6, 8.6]]
    ] },
    n: { advance: 21.6, contours: [
      [[0, 5.25], [3.95, 5.25], [5.55, 7.3], [8.15, 5.25], [16.25, 5.25], [18.85, 6.55], [19.95, 8.5],
        [19.95, 14.65], [14.65, 14.65], [14.65, 10.1], [11.85, 8], [5.55, 10.2], [5.55, 14.65], [0, 14.65]]
    ] },
    j: { advance: 15.5, contours: [
      [[5.6, .2], [13.3, .2], [14.45, 1.2], [14.45, 2.35], [13.25, 3.2], [5.6, 3.2], [4.45, 2.35], [4.45, 1.2]],
      [[8.95, 5.25], [14.45, 5.25], [14.45, 14.15], [13.1, 16.25], [10.85, 17.5], [0, 17.5],
        [1.9, 14.35], [7.4, 14.35], [8.95, 13.1]]
    ] }
  }
};
// Rounded counters and a low x-height follow the Spotify wordmark.
const streamName = {
  height: 23,
  pixelGrid: true,
  glyphs: {
    i: { advance: 6.4, contours: [
      [[1.4, 0], [3.8, 0], [5.2, 1.45], [5.2, 3.65], [3.8, 5], [1.4, 5], [0, 3.65], [0, 1.45]],
      [[.25, 6.8], [4.95, 6.8], [4.95, 18.7], [.25, 18.7]]
    ] },
    B: { advance: 16.9, contours: [
      [[0, .25], [8.5, .25], [12.4, 1], [14.3, 2.6], [14.8, 4.9], [14.15, 7.1], [12.25, 8.55],
        [14.6, 9.75], [15.8, 11.8], [15.8, 14.55], [14.1, 17.15], [11, 18.7], [0, 18.7]],
      [[4.7, 4.05], [8.5, 4.05], [10.2, 4.8], [10.2, 6.6], [8.65, 7.45], [4.7, 7.45]],
      [[4.7, 11.15], [9.4, 11.15], [11, 12.1], [11, 13.95], [9.4, 14.95], [4.7, 14.95]]
    ] },
    e: { advance: 15.25, contours: [
      [[0, 10.55], [1.25, 8.35], [3.85, 6.65], [8.15, 6.15], [11.55, 7.3], [13.35, 9.55], [13.95, 13.5],
        [4.45, 13.5], [5.25, 14.95], [7.3, 15.55], [10, 15.25], [12.15, 14.05], [13.7, 16.9],
        [11.2, 18.45], [7.2, 19], [3.9, 18.45], [1.25, 16.85], [0, 14.35]],
      [[4.4, 11.15], [5.45, 9.7], [7.15, 9.35], [8.85, 9.85], [9.5, 11.15]]
    ] },
    n: { advance: 15.1, contours: [
      [[0, 6.8], [4.5, 6.8], [4.5, 8.15], [6.65, 6.7], [9.8, 6.45], [12.3, 7.45], [13.8, 9.65],
        [13.8, 18.7], [9.3, 18.7], [9.3, 11.65], [8.55, 10.35], [7.2, 10], [5.8, 10.4], [4.55, 11.55], [4.55, 18.7], [0, 18.7]]
    ] },
    j: { advance: 8.15, contours: [
      [[3, 0], [5.25, 0], [6.8, 1.45], [6.8, 3.65], [5.25, 5], [3, 5], [1.45, 3.65], [1.45, 1.45]],
      [[1.75, 6.8], [6.55, 6.8], [6.55, 18.6], [5.75, 21.25], [3.7, 22.8], [-.85, 23],
        [-1.45, 19.75], [.55, 19.75], [1.75, 18.55]]
    ] }
  }
};

const styles = {
  ...referenceLettering,
  'neural-drink': [
    ...referenceLettering['neural-drink'],
    { text: '-', outline: neuralFooter, rect: [.101, .752, .798, .182], y: .839, width: .796, height: .174,
      ink: '#ffffff', clearInk: 'keep' }
  ],
  girl: [
    null,
    { text: 'SOUND TEAM', outline: brushLabel, y: .835, width: .807, height: .104, ink: '#ed08eb' },
    { text: '-', outline: brushStroke, rect: [.079, .911, .806, .07], y: .946, width: .788, height: .06, ink: '#ed08eb' }
  ],
  'terminal-crt': [
    { text: 'iBenji', font: terminalName, x: .478, y: .444, width: .638, height: .198, ink: '#ffffff',
      trim: '#96a0a5', glint: '#c5f8ff', scaleToFit: true },
    { text: 'SOUND TEAM', font: terminalLabel, x: .478, y: .580, width: .598, height: .073, ink: '#c5f8ff', scaleToFit: true }
  ],
  planet: [
    { text: 'SOUND TEAM', font: orbitLabel, rect: [.084, .742, .832, .073], y: .776,
      width: .521, height: .066, ink: '#ffffff', scaleToFit: true, minSize: 64 }
  ],
  torii: [
    { text: 'SOUND TEAM', font: toriiLabel, rect: [.132, .882, .732, .079], y: .921,
      width: .712, height: .068, ink: '#ffffff', lean: 1, scaleToFit: true }
  ],
  thermal: [
    { text: 'iBenji', font: scannerName, y: .841, width: .615, height: .095, ink: '#c8fff4', scaleToFit: true, minSize: 75 },
    ...referenceLettering.thermal
  ],
  'red-vector': [
    { text: 'iBenji', outline: sprint, x: .5, y: .279, width: .84, height: .213, ink: '#ffffff' }
  ],
  console: [
    null, null,
    { text: '®', font: registered, x: .876, y: .610, width: .068, height: .068, ink: '#ffffff', scaleToFit: true, minSize: 90 }
  ],
  'stream-disc': [
    { text: 'iBenji', outline: streamName, x: .483, y: .685, width: .778, height: .226, ink: '#ffffff' }
  ],
  'chroma-note': [
    { text: 'iBenji', font: chromaName, y: .691, width: .638, height: .193, ink: '#ffffff',
      trim: '#f8023d', glint: '#00f5fb', scaleToFit: true }
  ],
  'mecha-ouroboros': [
    { text: 'iBenji', font: forge, y: .492, width: .686, height: .188, ink: '#ffffff', scaleToFit: true },
    { text: 'SOUND TEAM', font: forgeLabel, y: .640, width: .591, height: .077, ink: '#ffffff', minSize: 75 }
  ],
  'ring-mark': [
    { text: 'IBENJI', font: ringName, x: .509, y: .768, width: .745, height: .15, ink: '#ffffff',
      trim: '#8795a6', lean: 1, scaleToFit: true },
    { text: 'SOUND TEAM', font: ringLabel, y: .93, width: .693, height: .057, ink: '#ffffff', scaleToFit: true }
  ],
  'green-eye': [
    { text: 'iBenji', outline: aphex, x: .478, y: .713, width: .86, height: .153, ink: '#ffffff' }
  ],
  umbrella: [
    { text: 'IBENJI', font: umbrellaName, x: .484, y: .731, width: .707, height: .148, ink: '#ffffff',
      lean: 2, scaleToFit: true },
    null,
    { text: '®', font: registered, x: .906, y: .650, width: .053, height: .053, ink: '#ffffff', scaleToFit: true }
  ],
  'acid-cabinet': [
    { text: '', rect: [.031, .886, .168, .088], x: .118, y: .929, width: .146, height: .070, ink: '#ff079c',
      bitmap: ['..........##', '..........##', '.......##.##', '.......##.##', '....##.##.##', '##..##.##.##', '##..##.##.##'] },
    { text: '', rect: [.798, .886, .176, .088], x: .882, y: .929, width: .146, height: .070, ink: '#ff079c',
      bitmap: ['##..........', '##..........', '##.##.......', '##.##.......', '##.##.##....', '##.##.##..##', '##.##.##..##'] }
  ],
};

function drawOutline(line, pixels, side, placement, region, clip, ink) {
  const { height, slant = 0, glyphs, pixelGrid = false } = line.outline;
  const letters = [...line.text].map(letter => glyphs[letter]);
  const columns = letters.reduce((sum, glyph) => sum + glyph.advance, slant * height);
  const scale = Math.min(side * line.width / columns, side * line.height / height);
  const x0 = (line.x ?? .5) * side - columns * scale / 2;
  const y0 = (placement[1] + line.y * placement[3]) * side - height * scale / 2;
  const [left, top, right, bottom] = clip;
  for (let py = top; py < bottom; py++) {
    const row = (py + .5 - y0) / scale;
    if (row < 0 || row >= height) continue;
    const scan = pixelGrid ? Math.floor(row) + .5 : row;
    const edges = [];
    let cursor = x0 + slant * (height - scan) * scale;
    for (const { advance, contours } of letters) {
      for (const contour of contours) {
        for (let i = 0, previous = contour.length - 1; i < contour.length; previous = i++) {
          const [ax, ay] = contour[previous], [bx, by] = contour[i];
          if ((ay > scan) === (by > scan)) continue;
          const edge = cursor + (ax + (scan - ay) * (bx - ax) / (by - ay)) * scale;
          edges.push(pixelGrid ? x0 + Math.ceil((edge - x0) / scale - .5) * scale : edge);
        }
      }
      cursor += advance * scale;
    }
    edges.sort((a, b) => a - b);
    const offset = (py - region.top) * region.width - region.left;
    for (let i = 0; i < edges.length; i += 2) {
      const start = Math.max(left, Math.ceil(edges[i] - .5));
      const end = Math.min(right, Math.ceil(edges[i + 1] - .5));
      if (start < end) pixels.fill(ink, offset + start, offset + end);
    }
  }
}

function drawLettering(scene, pixels, palette, side, placement, region) {
  const lines = styles[scene.id];
  if (!lines) return;
  const [ox, oy, w, h] = placement;
  const { left, top, width, height } = region;
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    const { text, font, ink, trim = ink, x = .5, y, lean = 0, minSize = 0 } = line;
    if (side < minSize) continue;
    const [rx, ry, rw, rh] = line.rect ?? scene.text[index];
    const l = Math.max(left, Math.floor((ox + rx * w) * side));
    const t = Math.max(top, Math.floor((oy + ry * h) * side));
    const r = Math.min(left + width, Math.ceil((ox + (rx + rw) * w) * side));
    const b = Math.min(top + height, Math.ceil((oy + (ry + rh) * h) * side));
    if (l >= r || t >= b) continue;
    const foreground = palette.indexOf(ink);
    const background = palette.indexOf(line.background ?? '#000000');
    const remove = line.clearInk && palette.map(hex => {
      const [red, green, blue] = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
      if (line.clearInk === 'keep') return false;
      if (line.clearInk === 'black') return Math.max(red, green, blue) < 112;
      if (line.clearInk === 'red') return red > 80 && red > Math.max(green, blue) * 1.45;
      if (line.clearInk === 'yellow') return red > 100 && green > 70 && blue < green * .65;
      if (line.clearInk === 'blue') return blue > 66 && blue > Math.max(red, green) * 1.23;
      return Math.max(red, green, blue) - Math.min(red, green, blue) < 58 && Math.max(red, green, blue) > 25;
    });
    for (let py = t; py < b; py++) {
      const offset = (py - top) * width - left;
      if (remove) {
        for (let px = l; px < r; px++) if (remove[pixels[offset + px]]) pixels[offset + px] = background;
      } else pixels.fill(background, offset + l, offset + r);
    }
    if (line.bitmap) {
      const bitmap = line.bitmap;
      const inks = Object.fromEntries(Object.entries(line.inks ?? { '#': ink }).map(([symbol, color]) => {
        const index = palette.indexOf(color);
        if (index < 0) throw new Error(`Missing bitmap color ${color} for ${scene.id}`);
        return [symbol, index];
      }));
      const spanX = side * line.width, spanY = side * h * line.height;
      const startX = x * side - spanX / 2, startY = (oy + y * h) * side - spanY / 2;
      for (let py = t; py < b; py++) {
        const row = bitmap[Math.floor((py + .5 - startY) / spanY * bitmap.length)];
        if (!row) continue;
        const offset = (py - top) * width - left;
        for (let px = l; px < r; px++) {
          const column = Math.floor((px + .5 - startX) / spanX * row.length);
          const color = inks[row[column]];
          if (color !== undefined) pixels[offset + px] = color;
        }
      }
      continue;
    }
    if (line.outline) {
      drawOutline(line, pixels, side, placement, region, [l, t, r, b], foreground);
      continue;
    }
    const glyphs = [...text].map(letter => {
      const glyph = font[letter] ?? '00/00/00/00/00';
      return typeof glyph === 'string' ? glyph.split('/') : glyph;
    });
    const columns = glyphs.reduce((sum, rows) => sum + rows[0].length + 1, lean - 1);
    const rows = glyphs[0].length;
    const fit = Math.min(side * line.width / columns, side * line.height / rows);
    const step = line.scaleToFit ? fit : Math.max(1, Math.floor(fit));
    const centerX = x * side - columns * step / 2;
    const centerY = (oy + y * h) * side - rows * step / 2;
    const x0 = line.scaleToFit ? centerX : Math.round(centerX);
    const y0 = line.scaleToFit ? centerY : Math.round(centerY);
    const inks = [0, foreground, palette.indexOf(trim), palette.indexOf(line.glint ?? ink)];
    let cursor = x0;
    for (const glyph of glyphs) {
      for (let j = 0; j < glyph.length; j++) for (let i = 0; i < glyph[j].length; i++) {
        const mark = glyph[j][i];
        if (mark === '0') continue;
        const offsetX = cursor + Math.round(lean * (rows - 1 - j) / (rows - 1)) * step;
        const leftCell = Math.max(l, Math.ceil(offsetX + i * step - .5));
        const rightCell = Math.min(r, Math.ceil(offsetX + (i + 1) * step - .5));
        if (leftCell >= rightCell) continue;
        const topCell = Math.max(t, Math.ceil(y0 + j * step - .5));
        const bottomCell = Math.min(b, Math.ceil(y0 + (j + 1) * step - .5));
        for (let py = topCell; py < bottomCell; py++) {
          const offset = (py - top) * width - left;
          pixels.fill(inks[Number(mark)], offset + leftCell, offset + rightCell);
        }
      }
      cursor += (glyph[0].length + 1) * step;
    }
  }
}

module.exports = drawLettering;
