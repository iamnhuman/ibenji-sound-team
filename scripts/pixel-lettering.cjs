'use strict';

const bone = {
  I: '1221/0110/0110/0110/0110/1111', B: '111120/110011/111120/110011/110011/111110',
  E: '11112/11000/11110/11000/11000/11111', N: '11001/11101/11011/11011/10011/10012',
  J: '00211/00011/00011/00011/11011/01110'
};
const block = {
  S: '011/100/010/001/110', O: '111/101/101/101/111', U: '101/101/101/101/111',
  N: '1001/1101/1011/1001/1001', D: '110/101/101/101/110', T: '111/010/010/010/010',
  E: '111/100/110/100/111', A: '010/101/111/101/101', M: '10001/11011/10101/10001/10001'
};
const brushLabel = {
  S: '0011111/0111000/1110000/0111100/0000110/1001110/1111000',
  O: '001110/011111/111011/110011/110111/111110/011100', U: '110011/110011/110011/110011/110111/111110/011100',
  N: '110011/111011/111011/110111/110111/110011/100010', D: '111100/111110/110111/110011/110111/111110/111100',
  T: '0011111/1111110/0011100/0011000/0011000/0111000/0100000',
  E: '001111/011110/110000/111110/110000/111110/111100', A: '001110/011110/111011/110011/111111/110011/100011',
  M: '1100011/1110111/1111111/1101011/1100011/1100011/1100010'
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
const pocketLabel = {
  S: '011/100/100/010/001/001/110', O: '010/101/101/101/101/101/010', U: '101/101/101/101/101/101/010',
  N: '1001/1101/1101/1011/1011/1001/1001', D: '110/101/101/101/101/101/110', T: '111/010/010/010/010/010/010',
  E: '111/100/100/110/100/100/111', A: '010/101/101/111/101/101/101',
  M: '10001/11011/10101/10101/10001/10001/10001', ' ': '0/0/0/0/0/0/0'
};
const scannerName = {
  i: '011110/111110/000000/001110/001110/001110/001110/000000',
  B: '01111111100/11111111110/11100001110/11111111100/11100001111/11100001111/11111111110/00000000000',
  e: '0000000000/0000000000/0111111110/1110001111/1111111111/1110000000/0111111110/0000000000',
  n: '0000000000/0000000000/1111111100/1111111110/1111001110/1111001110/1111001110/0000000000',
  j: '00111110/01111110/00000000/00011100/00011100/00011100/00111100/11111000'
};
const circuit = {
  I: '111/011/011/011/011/011/111', B: '11110/11001/11001/11110/11001/11001/11110',
  E: '1111/1100/1100/1110/1100/1100/1111', N: '10001/11001/11001/10101/10011/10011/10001',
  J: '0111/0011/0011/0011/0011/1011/1110'
};
const signal = {
  S: '1111/1000/0110/0001/1110', O: '0110/1001/1001/1001/0110', U: '1001/1001/1001/1001/0110',
  N: '1001/1101/1011/1001/1001', D: '1110/1001/1001/1001/1110', T: '111/010/010/010/010',
  E: '1111/1000/1110/1000/1111', A: '0110/1001/1111/1001/1001', M: '11011/10101/10001/10001/10001'
};
const scannerLabel = {
  S: '01111/11000/11110/00011/00011/11110', O: '01110/11011/11011/11011/11011/01110',
  U: '11011/11011/11011/11011/11011/01110', N: '11001/11101/11101/10111/10011/10011',
  D: '11110/11011/11011/11011/11011/11110', T: '11111/11111/00100/00100/00100/00100',
  E: '11111/11000/11110/11000/11000/11111', A: '01110/11011/11011/11111/11011/11011',
  M: '110011/111111/111111/110011/110011/110011'
};
const razor = {
  i: '01/00/11/11/11/11/11/00', B: '11110/11011/11011/11110/11011/11011/11110/00000',
  e: '00000/00000/01111/11011/11110/11000/01111/00000', n: '00000/00000/11110/11111/11011/11011/11011/00000',
  j: '0011/0000/0011/0011/0011/0011/1011/1110'
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
const sprint = {
  height: 22,
  slant: .29,
  glyphs: {
    i: { advance: 8.9, contours: [
      [[1.1, .3], [6.55, .3], [6.55, 3.75], [.65, 3.75], [.65, .8]],
      [[1.65, 5.65], [6.55, 5.65], [6.55, 16.7], [5, 18.25], [.65, 18.25], [.65, 7.1]]
    ] },
    B: { advance: 19.9, contours: [
      [[1.4, 0], [14.6, 0], [17.4, 1.3], [18.45, 3.45], [18.45, 6.2], [17.2, 7.8],
        [15.6, 8.6], [17.55, 9.8], [18.7, 11.75], [18.7, 14.45], [17.5, 16.55], [14.45, 18.25], [0, 18.25], [0, 1.4]],
      [[5.4, 3.6], [12.15, 3.6], [13.5, 4.6], [13.5, 5.9], [12.25, 7.12], [5.4, 7.12]],
      [[5.4, 10.65], [12.35, 10.65], [13.8, 11.9], [13.8, 13.6], [12.4, 14.75], [5.4, 14.75]]
    ] },
    e: { advance: 16.9, contours: [
      [[4.2, 5], [12, 5], [14.5, 6.2], [15.55, 8.4], [15.55, 11.7], [4.75, 11.7], [4.75, 13.5],
        [6, 14.8], [15.2, 14.8], [14, 17.05], [11.9, 18.25], [4.2, 18.25], [1.2, 16.75], [0, 14.4], [0, 8.6], [1.3, 6.3]],
      [[4.75, 9.25], [4.75, 8.75], [6, 7.75], [10.3, 7.75], [11.45, 8.45], [11.45, 9.25]]
    ] },
    n: { advance: 17.3, contours: [
      [[0, 5], [4.2, 5], [5, 6.35], [6.7, 5], [12.05, 5], [14.65, 6.3], [15.65, 8.5], [15.65, 18.25],
        [10.7, 18.25], [10.7, 9.6], [9.6, 8.55], [6.1, 8.55], [4.95, 9.65], [4.95, 18.25], [0, 18.25]]
    ] },
    j: { advance: 11.6, contours: [
      [[5.2, .3], [10.15, .3], [10.15, 3.75], [4.75, 3.75], [4.75, .8]],
      [[4.75, 5.65], [10.15, 5.65], [10.15, 17.55], [9.15, 19.75], [6.65, 22], [0, 22],
        [1.3, 18.75], [3.4, 18.75], [4.75, 17.4]]
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
// The rising cuts in B and e and the long foot of j follow the ImageGen sketch.
const streamWave = {
  i: ['00111', '01111', '11110', '00000', '11110', '11110', '11110', '11110', '11110', '11110', '11110', '11110', '00000', '00000'],
  B: ['00111111111100', '01111111111110', '11111111111111', '11111111000111', '11111000000111', '11100000011111', '11111111111110',
    '11111111111110', '11111111000111', '11111000000111', '11100000011111', '11111111111110', '00000000000000', '00000000000000'],
  e: ['0000000000000', '0000000000000', '0000000000000', '0011111111100', '0111111111110', '1111110000011', '1100000001111',
    '1111111111111', '1111000000000', '1111000000000', '0111111111111', '0011111111110', '0000000000000', '0000000000000'],
  n: ['000000000000', '000000000000', '000000000000', '111111100000', '111111111100', '111111111110', '111110011111',
    '111100001111', '111100001111', '111100001111', '111100001111', '111100001111', '000000000000', '000000000000'],
  j: ['0000000111', '0000001111', '0000011110', '0000000000', '0000011110', '0000011110', '0000011110',
    '0000011110', '0000011110', '0000011110', '0000011110', '0000111110', '1111111100', '0111111000']
};

const styles = {
  girl: [
    null,
    { text: 'SOUND TEAM', font: brushLabel, y: .835, width: .80, height: .10, ink: '#ed08eb', lean: 2, scaleToFit: true },
    { text: '-', outline: brushStroke, rect: [.079, .911, .806, .07], y: .946, width: .788, height: .06, ink: '#ed08eb' }
  ],
  violet: [
    { text: 'iBenji', font: razor, x: .619, y: .451, width: .434, height: .118, ink: '#ffffff', lean: 3, minSize: 90 },
    { text: 'SOUND TEAM', font: signal, x: .542, y: .733, width: .305, height: .028, ink: '#b8f223', minSize: 195 }
  ],
  spine: [
    { text: 'IBENJI', font: bone, y: .819, width: .67, height: .124, ink: '#ffffff', trim: '#9425ed', lean: 1 },
    { text: 'SOUND TEAM', font: block, y: .938, width: .57, height: .067, ink: '#ffffff' }
  ],
  thermal: [
    { text: 'iBenji', font: scannerName, y: .841, width: .615, height: .095, ink: '#c8fff4', scaleToFit: true, minSize: 75 },
    { text: 'SOUND TEAM', font: scannerLabel, y: .939, width: .625, height: .064, ink: '#63b5c3', scaleToFit: true, minSize: 75 }
  ],
  'cyber-hand': [
    { text: 'IBENJI', font: circuit, y: .802, width: .612, height: .142, ink: '#fff400', lean: 3 },
    { text: 'SOUND TEAM', font: signal, y: .944, width: .53, height: .067, ink: '#21ff00', lean: 1, minSize: 75 }
  ],
  'pocket-pet': [
    null,
    { text: 'SOUND TEAM', font: pocketLabel, x: .47, y: .836, width: .84, height: .145, ink: '#91fbe5' }
  ],
  'red-vector': [
    { text: 'iBenji', outline: sprint, x: .5, y: .279, width: .84, height: .213, ink: '#ffffff' }
  ],
  'stream-disc': [
    { text: 'iBenji', font: streamWave, x: .485, y: .684, width: .79, height: .192, ink: '#ffffff', scaleToFit: true }
  ],
  'mecha-ouroboros': [
    { text: 'iBenji', font: forge, y: .492, width: .686, height: .188, ink: '#ffffff', scaleToFit: true },
    { text: 'SOUND TEAM', font: forgeLabel, y: .640, width: .591, height: .077, ink: '#ffffff', minSize: 75 }
  ],
  'green-eye': [
    { text: 'iBenji', outline: aphex, x: .478, y: .713, width: .86, height: .153, ink: '#ffffff' }
  ]
};

function drawOutline(line, pixels, side, placement, region, clip, ink) {
  const { height, slant = 0, glyphs } = line.outline;
  const letters = [...line.text].map(letter => glyphs[letter]);
  const columns = letters.reduce((sum, glyph) => sum + glyph.advance, slant * height);
  const scale = Math.min(side * line.width / columns, side * line.height / height);
  const x0 = (line.x ?? .5) * side - columns * scale / 2;
  const y0 = (placement[1] + line.y * placement[3]) * side - height * scale / 2;
  const [left, top, right, bottom] = clip;
  for (let py = top; py < bottom; py++) {
    const scan = (py + .5 - y0) / scale;
    if (scan < 0 || scan >= height) continue;
    const edges = [];
    let cursor = x0 + slant * (height - scan) * scale;
    for (const { advance, contours } of letters) {
      for (const contour of contours) {
        for (let i = 0, previous = contour.length - 1; i < contour.length; previous = i++) {
          const [ax, ay] = contour[previous], [bx, by] = contour[i];
          if ((ay > scan) === (by > scan)) continue;
          edges.push(cursor + (ax + (scan - ay) * (bx - ax) / (by - ay)) * scale);
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
    for (let py = t; py < b; py++) {
      const offset = (py - top) * width - left;
      pixels.fill(0, offset + l, offset + r);
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
    const trimInk = palette.indexOf(trim);
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
          pixels.fill(mark === '2' ? trimInk : foreground, offset + leftCell, offset + rightCell);
        }
      }
      cursor += (glyph[0].length + 1) * step;
    }
  }
}

module.exports = drawLettering;
