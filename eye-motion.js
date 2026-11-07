/* The original winged emblem stays intact while its eye and halo move. */
(function (root) {
  'use strict';

  const tau = Math.PI * 2;

  function draw(frame, rows, { gaze, open, accent, shadow, turn }) {
    const { size, pixels, palette } = frame;
    const original = pixels.slice();
    const white = palette.indexOf('#ffffff');
    const pink = palette.indexOf(accent);
    const magenta = palette.map(hex => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return r > 75 && r > g * 2 && b > g * 2;
    });

    for (let y = 0; y < rows; y++) {
      const v = (y + .5) / size;
      for (let x = 0; x < size; x++) {
        const cell = y * size + x;
        const ink = original[cell];
        const u = (x + .5) / size;
        const hx = (u - .5) / .371, hy = (v - .238) / .177;
        const radius = Math.hypot(hx, hy);
        if (magenta[ink] && radius > .95 && radius < 1.075) {
          const angle = Math.atan2(hy, hx) - turn;
          const segment = ((angle * 4) % tau + tau) % tau;
          if (segment < .44) pixels[cell] = shadow;
          else if (segment < .60) pixels[cell] = white;
          else if (segment < .95) pixels[cell] = pink;
        }

        const dx = (u - .501) / .108;
        if (Math.abs(dx) > 1 || (open === 1 && !gaze)) continue;
        const lid = .037 * (1 - Math.abs(dx) ** 1.8);
        const dy = v - .269;
        if (Math.abs(dy) > lid) continue;
        if (open < .18) {
          pixels[cell] = Math.abs(dy) < .51 / size ? white : 0;
        } else if (Math.abs(dy) > lid * open) {
          pixels[cell] = 0;
        } else {
          const sx = Math.floor((u - gaze * (1 - dx ** 2)) * size);
          const sy = Math.floor((.269 + dy / open) * size);
          pixels[cell] = original[sy * size + sx];
        }
      }
    }
  }

  const api = { draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PixelEye = api;
})(globalThis);
