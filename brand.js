/* 64 × 62 sprite sampled from img/done/ibenji_color_02.png.
 * . = black, # = white, + = red. The fire uses a separate indexed palette.
 */
(function (root) {
  'use strict';

  const stencil = [
    '................................................................',
    '................................................................',
    '................................................................',
    '................................................................',
    '................................................................',
    '...........................................++...................',
    '........................................++++............+.......',
    '............................+.........+++++.............+.......',
    '.........................+++........++++++..............++......',
    '......................+++++.........+++++............+++++......',
    '.....................+++++..........+++++............++++.......',
    '.....................+++++...........+++++.........+++++........',
    '......................+++++.....+..+++++++.........+++++........',
    '.............++.......++++++...++.++++++++.+.......++++++.......',
    '...........++++....+.+++++++..++++++++++++.+........++++++......',
    '..........+++++...+++++++++..++++++++++++++++......+++++++......',
    '..........++++##+++++++++++++###+++++++++++++....+++++++++......',
    '..........++++###+++++.+++++####++++.+++++++...+.+++++++++...+..',
    '..........++##..###++..++++#..##++...+++++++..+++++++++++...+...',
    '..........++##...##+....+.....##.....++++++..++++++++++++..++...',
    '.........+++##...###.####......#.....+.+++++++++++++.+++..+++...',
    '......+++++###...............###.......++++++++++++.+++++++++...',
    '.....++++##...................####.....+++++++++++..+++++++++...',
    '....+++++##.....................#########+++++++....++++++++....',
    '...++++##.....##.......###......###############.....++++++++....',
    '...++##.......##.......##......................####...++++++....',
    '...++##...........###.............................###.++++......',
    '...++##...........###..............................##..++.......',
    '....+##.....##...........##........................###+++.......',
    '....+##.......###########...........................##+.........',
    '.....####......#########............................####........',
    '......+##.............................................###.......',
    '.......++##.............................................###.....',
    '.........++########.......................................##....',
    '..........+++++.#....#####....##########...###.....####...###...',
    '.............++##...##...##...##.......##..##.##...##.##....##..',
    '..............###...##...##..###.......##..##.##...##..###.###..',
    '..............##...###..##...###......##..###.##.####...##.###..',
    '............##....##...##...##......##...##.##...##.....###.##..',
    '............#######....#######.......#####..#######.....######..',
    '..............##..........................................##....',
    '................................................................',
    '................................................................',
    '....######..#######...#########..##....###...########.######....',
    '......###...##....###.##.........###...###.......###....##......',
    '......##....##....###.###........####..###.......##.....##......',
    '......##....########..#######....##.##.###.......##.....##......',
    '......##....##.....##.##.........##...####.##....##.....##......',
    '......##....##....###.###........##...####.##....##.....###.....',
    '....######..#######...#########..##....###...#####....######....',
    '................................................................',
    '................................................................',
    '.....#####.####.##..#.##..#.####......####.#####..###..##.##....',
    '.....####..#..####..#.###.#.#..##......##..####..##.##.#####....',
    '.........#.#..####..#.##.##.#..##......##..##....#####.#..##....',
    '......###...###..###..#...#.###.........#..#####.#...#.#..##....',
    '................................................................',
    '...........++++++++++++++++++++++++++++++++++++++++++++.........',
    '................+..+++++++++++++++++++++++++++++++++++++++++....',
    '................................................................',
    '................................................................',
    '................................................................'
  ];

  const width = stencil[0].length;
  const height = stencil.length;
  const resting = Uint8Array.from(stencil.join(''), cell => '.#+'.indexOf(cell));
  const palette = ['#000000', '#f6f4fa', '#ff1910', '#a61e13', '#ff6517', '#ffad32', '#ffe687'];
  const flameRows = 41;
  const top = new Int16Array(width).fill(height);
  const bottom = new Int16Array(width).fill(-1);
  const catEdge = new Int16Array(width).fill(height);

  // The red underline is below the flame rows and stays with the lettering.
  for (let y = 0; y < flameRows; y++) {
    for (let x = 0; x < width; x++) {
      const color = resting[y * width + x];
      if (color === 2) {
        top[x] = Math.min(top[x], y);
        bottom[x] = y;
      }
      if (color === 1) catEdge[x] = Math.min(catEdge[x], y);
    }
  }

  function frameAt(time) {
    if (time === undefined) return { pixels: resting, palette };
    const pixels = resting.slice();
    for (let x = 0; x < width; x++) {
      if (bottom[x] < 0) continue;
      const flicker = Math.sin(time * 12 + x * .48) + .4 * Math.sin(time * 18 - x * .83);
      const lift = Math.max(0, Math.round(1.25 + flicker * 1.9));
      for (let y = Math.max(0, top[x] - lift); y < Math.min(top[x], catEdge[x]); y++) {
        const index = y * width + x;
        if (!resting[index]) pixels[index] = y === top[x] - 1 ? 2 : 3;
      }
      const depth = Math.max(1, bottom[x] - top[x]);
      for (let y = top[x]; y <= bottom[x]; y++) {
        const index = y * width + x;
        if (resting[index] !== 2) continue;
        const heat = (y - top[x]) / depth + .22 * Math.sin(time * 11 - y * .72 + x * .34) + .11 * flicker;
        if (heat > 1.03) pixels[index] = 6;
        else if (heat > .79) pixels[index] = 5;
        else if (heat > .48) pixels[index] = 4;
      }
    }
    for (const source of [13, 24, 37, 49, 56]) {
      const rise = (time * 10 + source * .31) % 10;
      const x = source + Math.round(Math.sin(time * 5 + source) * 2);
      const y = Math.floor(top[source] - 2 - rise);
      if (y >= 0 && y < Math.min(flameRows, catEdge[x]) && !pixels[y * width + x]) {
        pixels[y * width + x] = rise < 4 ? 5 : 3;
      }
    }
    return { pixels, palette };
  }

  function mount() {
    const link = document.getElementById('site-brand');
    const canvas = link.querySelector('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    const image = context.createImageData(width, height);
    let hovering = false;
    let focused = false;
    let animationFrame = 0;
    let previousStep = -1;

    function paint(time) {
      root.PixelArt.rgba(frameAt(time), image.data);
      context.putImageData(image, 0, 0);
    }

    function tick(timestamp) {
      const step = Math.floor(timestamp / 62.5);
      if (step !== previousStep) {
        paint(step / 16);
        previousStep = step;
      }
      animationFrame = requestAnimationFrame(tick);
    }

    function sync() {
      if (hovering || focused) {
        if (!animationFrame) animationFrame = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        previousStep = -1;
        paint();
      }
    }

    link.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') {
        hovering = true;
        sync();
      }
    });
    link.addEventListener('pointerleave', () => { hovering = false; sync(); });
    link.addEventListener('focus', () => { focused = link.matches(':focus-visible'); sync(); });
    link.addEventListener('blur', () => { focused = false; sync(); });
    paint();
    document.getElementById('site-icon').href = canvas.toDataURL('image/png');
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { width, height, frameAt };
  else mount();
})(globalThis);
