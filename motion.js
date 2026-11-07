/* Four short cuts built on the same pixel grid as the artwork. */
(function (root) {
  'use strict';

  const pixelArt = typeof module !== 'undefined' && module.exports
    ? require('./pixel-art.js')
    : root.PixelArt;
  const clipLength = 3;
  const frameRate = 24;
  const closeTime = 4 / frameRate;
  const openTime = 2 / frameRate;
  const cuts = ['iris', 'beam', 'splice', 'cascade'];
  // File sizes are exact. The artwork grids keep the pixel steps visible.
  const artworkGrids = new Map([[50, 50], [100, 100], [200, 112], [500, 125], [1000, 144]]);
  const focus = {
    eye: [.5, .29], girl: [.5, .46], skull: [.5, .39], scream: [.52, .54],
    wave: [.60, .34], violet: [.35, .30], 'blood-eye': [.5, .52],
    orbit: [.5, .36], specter: [.69, .22], spine: [.37, .38],
    satellite: [.47, .25], crt: [.39, .38], planet: [.48, .40], torii: [.57, .30], thermal: [.5, .36],
    'broken-computer': [.46,.3], 'cyber-hand': [.54,.4],
    'pocket-pet': [.5,.38], hazard: [.5,.42], candy: [.5,.28], chrome: [.5,.25],
    slime: [.5,.4],
    'space-emblem': [.5, .46], 'red-bulls': [.51, .36], 'red-vector': [.46, .5], 'metal-mark': [.5, .45],
    console: [.5, .44], 'foot-stamp': [.51, .4], 'stream-disc': [.5, .34],
    'violet-player': [.54, .39], carnival: [.51, .38], 'prancing-horse': [.5, .35],
    crocodile: [.53, .38], 'chroma-note': [.50, .34], 'golden-harp': [.5, .32], 'mecha-ouroboros': [.5, .51],
    'ring-mark': [.50, .38], 'red-roof': [.50, .37], 'winged-shoe': [.55, .34], 'flame-type': [.5, .44],
    'green-eye': [.47, .36], umbrella: [.506, .35], 'flame-crest': [.5, .49]
  };
  const clips = pixelArt.scenes.map((scene, index) => ({
    scene,
    number: index + 1,
    start: index * clipLength,
    end: (index + 1) * clipLength,
    // The source number keeps each transition tied to its original emblem.
    cutStyle: cuts[(scene.number - 1) % cuts.length]
  }));
  const duration = clipLength * clips.length;

  function cellOrder(style, x, y, cx, cy, tile, incoming) {
    if (style === 'iris') return Math.hypot(x - cx, y - cy);
    const column = Math.floor(x / tile), row = Math.floor(y / tile);
    return (incoming ? -1 : 1) * (column + row * .76) + ((column * 3 + row * 2) % 5) * .24;
  }

  function cutFrame(frame, scene, openness, style, incoming) {
    if (openness >= 1 - 1e-8) return frame;
    const { size } = frame;
    const pixels = new Uint8Array(size * size);
    if (openness <= 1e-8) return { ...frame, pixels };
    const [fx, fy] = focus[scene.id] ?? [.5, .46];
    const grid = frame.artworkSize ?? size;
    const unit = size / grid;
    const cx = grid * fx, cy = grid * fy;
    const masked = style === 'iris' || style === 'cascade';
    const order = masked ? new Float32Array(grid * grid) : null;
    const tile = Math.max(3, Math.round(grid / 22));
    let limit = 0;
    if (order) {
      for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
        order[y * grid + x] = cellOrder(style, x + .5, y + .5, cx, cy, tile, incoming);
      }
      let first = Infinity, last = -Infinity;
      for (let index = 0; index < frame.pixels.length; index++) {
        if (!frame.pixels[index]) continue;
        const cell = Math.floor(Math.floor(index / size) / unit) * grid + Math.floor((index % size) / unit);
        first = Math.min(first, order[cell]);
        last = Math.max(last, order[cell]);
      }
      limit = first + (last - first) * openness;
    }

    const accent = frame.palette.indexOf(scene.accent);
    const beamHeight = openness ** 1.38;
    const beamWidth = 1 + (1 - openness) * .15;
    const drift = (1 - openness) ** 1.2 * grid;
    for (let y = 0; y < grid; y++) {
      const band = Math.floor(y / grid * 6);
      const direction = (band % 2 ? 1 : -1) * (incoming ? -1 : 1);
      const slide = Math.round(direction * drift * (.58 + band % 3 * .106));
      for (let x = 0; x < grid; x++) {
        let sx = x, sy = y, highlight = false;
        if (order) {
          const rank = order[y * grid + x];
          if (rank > limit) continue;
          const width = style === 'iris' ? 1.5 : .57;
          highlight = rank > limit - width && Math.floor((x + y) / 5) % 3 === 0;
        } else if (style === 'beam') {
          sx = Math.floor(cx + (x + .5 - cx) / beamWidth);
          sy = Math.floor(cy + (y + .5 - cy) / beamHeight);
          highlight = openness < .45 && Math.abs(y + .5 - cy) < 1;
        } else {
          sx = x - slide;
          highlight = openness < .73 && Math.floor((y + 1) / grid * 6) !== band && x % 7 < 3;
        }
        if (sx < 0 || sx >= grid || sy < 0 || sy >= grid) continue;
        for (let dy = 0; dy < unit; dy++) {
          const from = (sy * unit + dy) * size + sx * unit;
          const to = (y * unit + dy) * size + x * unit;
          for (let dx = 0; dx < unit; dx++) {
            const ink = frame.pixels[from + dx];
            pixels[to + dx] = ink && highlight && accent > 0 ? accent : ink;
          }
        }
      }
    }
    return { ...frame, pixels };
  }

  function frameAt(seconds, size = 100, { transition = true } = {}) {
    const wrapped = seconds % duration;
    const time = wrapped < 0 ? wrapped + duration : wrapped;
    const index = Math.floor(time / clipLength);
    const clip = clips[index];
    const elapsed = time - clip.start;
    const artworkGrid = scene => scene.artworkGrids?.[size] ?? artworkGrids.get(size) ?? size;
    const cut = clip.end - openTime;
    const closingAt = cut - closeTime;
    if (transition && time >= closingAt) {
      const incoming = time >= cut;
      const visibleIndex = incoming ? (index + 1) % clips.length : index;
      const scene = clips[visibleIndex].scene;
      const art = pixelArt.render(scene.id, artworkGrid(scene), incoming ? 0 : elapsed, { lettering: true });
      const openness = incoming
        ? 1 - ((clip.end - time) / openTime) ** 2
        : 1 - ((time - closingAt) / closeTime) ** 1.8;
      return {
        index: visibleIndex,
        progress: incoming ? 0 : elapsed / clipLength,
        frame: cutFrame(art, scene, openness, clip.cutStyle, incoming)
      };
    }
    return { index, progress: elapsed / clipLength,
      frame: pixelArt.render(clip.scene.id, artworkGrid(clip.scene), elapsed, { lettering: true }) };
  }

  const api = { clips, duration, frameRate, frameAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PixelMotion = api;
})(globalThis);
