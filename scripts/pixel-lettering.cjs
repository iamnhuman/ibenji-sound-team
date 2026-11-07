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
const acid = {
  I: '1221/0010/0110/0110/0100/1100/1111', B: '011220/110011/110011/111120/110011/110011/111110',
  E: '01222/11000/11000/11110/11000/11000/11111', N: '120011/111011/111011/110111/110111/110011/110012',
  J: '00122/00011/00011/00011/10011/11011/01110'
};
const acidLabel = {
  S: '0111/1100/0110/0011/1110', O: '0110/1001/1001/1001/0110', U: '1001/1001/1001/1001/0111',
  N: '1101/1101/1011/1011/1001', D: '1110/1001/1001/1001/1110', T: '111/010/010/010/010',
  E: '1111/1100/1110/1100/1111', A: '0110/1001/1111/1001/1001', M: '1111/1111/1001/1001/1001'
};
const lcd = {
  S: '111/100/111/001/111', O: '110/101/101/101/011', U: '101/101/101/101/011',
  N: '111/101/101/101/101', D: '110/101/101/101/110', T: '111/010/010/010/010',
  E: '111/100/110/100/111', A: '111/101/111/101/101', M: '10101/11111/10101/10101/10101',
  I: '111/010/010/010/111', B: '110/101/110/101/110', J: '011/001/001/101/111'
};
const scanner = {
  I: '11122/01110/01110/01110/01110/01110/22111', B: '111220/110011/110011/111110/110011/110011/111110',
  E: '11122/11000/11000/11110/11000/11000/22111', N: '11201/11101/11101/11011/11011/11011/11012',
  J: '02211/00011/00011/00011/11011/11011/01110'
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
const readout = {
  S: '01111/10000/01110/00001/11110', O: '01110/10001/10001/10001/01110', U: '10001/10001/10001/10001/01110',
  N: '11001/10101/10101/10011/10001', D: '11110/10001/10001/10001/11110', T: '11111/00100/00100/00100/00100',
  E: '11111/10000/11110/10000/11111', A: '01110/10001/11111/10001/10001', M: '10001/11011/10101/10001/10001'
};
const razor = {
  i: '01/00/11/11/11/11/11/00', B: '11110/11011/11011/11110/11011/11011/11110/00000',
  e: '00000/00000/01111/11011/11110/11000/01111/00000', n: '00000/00000/11110/11111/11011/11011/11011/00000',
  j: '0011/0000/0011/0011/0011/0011/1011/1110'
};
const forge = {
  I: '021/110/110/110/110/110/112', B: '01220/11011/11011/11110/11011/11011/11120',
  E: '1222/1100/1100/1110/1100/1100/1112', N: '12001/11101/11101/11011/11011/11011/11012',
  J: '0221/0011/0011/0011/1011/1011/1110'
};
const forgeLabel = {
  S: '01111/11000/01110/00011/11110', O: '01110/11011/11011/11011/01110', U: '11011/11011/11011/11011/01110',
  N: '11001/11101/11111/11011/11001', D: '11110/11011/11011/11011/11110', T: '11111/00100/00100/00100/00100',
  E: '11111/11000/11110/11000/11111', A: '01110/11011/11111/11011/11011', M: '11011/11111/10101/10001/10001'
};

const styles = {
  girl: [
    { text: 'IBENJI', font: acid, y: .132, width: .865, height: .150, ink: '#ed08eb', trim: '#f6f4fa', lean: 4 },
    { text: 'SOUND TEAM', font: acidLabel, y: .834, width: .82, height: .079, ink: '#ed08eb' }
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
    { text: 'IBENJI', font: scanner, y: .844, width: .64, height: .090, ink: '#ffffff', trim: '#63b5c3', minSize: 75 },
    { text: 'SOUND TEAM', font: readout, y: .939, width: .65, height: .062, ink: '#c8fff4', minSize: 75 }
  ],
  'cyber-hand': [
    { text: 'IBENJI', font: circuit, y: .802, width: .612, height: .142, ink: '#fff400', lean: 3 },
    { text: 'SOUND TEAM', font: signal, y: .944, width: .53, height: .067, ink: '#21ff00', lean: 1, minSize: 75 }
  ],
  'pocket-pet': [
    { text: 'IBENJI', font: lcd, y: .311, width: .415, height: .059, ink: '#000000', x: .47 },
    { text: 'SOUND TEAM', font: lcd, y: .835, width: .70, height: .091, ink: '#91fbe5', x: .4 }
  ],
  'mecha-ouroboros': [
    { text: 'IBENJI', font: forge, y: .492, width: .687, height: .177, ink: '#ffffff', trim: '#bfccd8', lean: 3 },
    { text: 'SOUND TEAM', font: forgeLabel, y: .640, width: .591, height: .077, ink: '#ffffff', minSize: 75 }
  ]
};

function drawLettering(scene, pixels, palette, side, placement, region) {
  const lines = styles[scene.id];
  if (!lines) return;
  const [ox, oy, w, h] = placement;
  const { left, top, width, height } = region;
  for (const [index, line] of lines.entries()) {
    const { text, font, ink, trim = ink, x = .5, y, lean = 0, minSize = 0 } = line;
    if (side < minSize) continue;
    const glyphs = [...text].map(letter => (font[letter] ?? '00/00/00/00/00').split('/'));
    const columns = glyphs.reduce((sum, rows) => sum + rows[0].length + 1, lean - 1);
    const rows = glyphs[0].length;
    const step = Math.max(1, Math.floor(Math.min(side * line.width / columns, side * line.height / rows)));
    const x0 = Math.round(x * side - columns * step / 2);
    const y0 = Math.round((oy + y * h) * side - rows * step / 2);
    const [rx, ry, rw, rh] = scene.text[index];
    const l = Math.max(left, Math.floor((ox + rx * w) * side));
    const t = Math.max(top, Math.floor((oy + ry * h) * side));
    const r = Math.min(left + width, Math.ceil((ox + (rx + rw) * w) * side));
    const b = Math.min(top + height, Math.ceil((oy + (ry + rh) * h) * side));
    if (l >= r || t >= b) continue;
    const background = index === 0 && scene.id === 'pocket-pet' ? palette.indexOf(scene.accent) : 0;
    const foreground = palette.indexOf(ink);
    const trimInk = palette.indexOf(trim);
    for (let py = t; py < b; py++) {
      const offset = (py - top) * width - left;
      pixels.fill(background, offset + l, offset + r);
    }
    let cursor = x0;
    for (const glyph of glyphs) {
      for (let j = 0; j < glyph.length; j++) for (let i = 0; i < glyph[j].length; i++) {
        const mark = glyph[j][i];
        if (mark === '0') continue;
        const offsetX = cursor + Math.round(lean * (rows - 1 - j) / (rows - 1)) * step;
        const leftCell = Math.max(l, offsetX + i * step);
        const rightCell = Math.min(r, offsetX + (i + 1) * step);
        if (leftCell >= rightCell) continue;
        for (let py = Math.max(t, y0 + j * step); py < Math.min(b, y0 + (j + 1) * step); py++) {
          const offset = (py - top) * width - left;
          pixels.fill(mark === '2' ? trimInk : foreground, offset + leftCell, offset + rightCell);
        }
      }
      cursor += (glyph[0].length + 1) * step;
    }
  }
}

module.exports = drawLettering;
