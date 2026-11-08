/* Four short cuts built on the same pixel grid as the artwork. */
(function (root) {
  'use strict';

  const commonJS = typeof module !== 'undefined' && module.exports;
  const pixelArt = commonJS ? require('./pixel-art.js') : root.PixelArt;
  const galleryOrder = commonJS ? require('./gallery-order.js') : root.PixelGalleryOrder;
  const clipLength = 3;
  const frameRate = 24;
  const closeTime = 4 / frameRate;
  const openTime = 2 / frameRate;
  const cuts = ['iris', 'hinge', 'mosaic', 'sync'];
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
    'ring-mark': [.50, .38], 'red-roof': [.50, .37], 'winged-shoe': [.55, .34],
    'green-eye': [.47, .36], umbrella: [.506, .35], 'flame-crest': [.5, .49]
  };
  function createTimeline({ ids = [], removed = [] } = {}) {
    const catalog = new Map(pixelArt.scenes.map(scene => [scene.id, scene]));
    const excluded = new Set(removed);
    const ordered = [...new Set([...ids, ...catalog.keys()])].filter(id => catalog.has(id) && !excluded.has(id));
    const scenes = ordered.length ? ordered.map(id => catalog.get(id)) : pixelArt.scenes;
    const clips = scenes.map((scene, index) => ({
      scene,
      number: index + 1,
      start: index * clipLength,
      end: (index + 1) * clipLength,
      // The source number keeps each transition tied to its original emblem.
      cutStyle: cuts[(scene.number - 1) % cuts.length]
    }));
    const duration = clipLength * clips.length;
    return { clips, duration, frameAt: (seconds, size, options) => renderTimeline(clips, duration, seconds, size, options) };
  }

  function artworkBounds({ pixels, size }, unit) {
    let left = size, top = size, right = 0, bottom = 0;
    for (let row = 0; row < size; row++) {
      const offset = row * size;
      let first = 0;
      while (first < size && !pixels[offset + first]) first++;
      if (first === size) continue;
      let end = size;
      while (!pixels[offset + end - 1]) end--;
      left = Math.min(left, first);
      right = Math.max(right, end);
      top = Math.min(top, row);
      bottom = row + 1;
    }
    return [Math.floor(left / unit), Math.floor(top / unit), Math.ceil(right / unit), Math.ceil(bottom / unit)];
  }

  function cutFrame(frame, scene, openness, style, incoming) {
    if (openness >= 1 - 1e-8) return frame;
    const { size } = frame;
    const pixels = new Uint8Array(size * size);
    if (openness <= 1e-8) return { ...frame, pixels };
    const grid = frame.artworkSize ?? size;
    const unit = size / grid;
    const [left, top, right, bottom] = artworkBounds(frame, unit);
    if (right <= left || bottom <= top) return { ...frame, pixels };
    const halfWidth = (right - left) / 2, halfHeight = (bottom - top) / 2;
    const centerX = left + halfWidth, centerY = top + halfHeight;
    const [fx, fy] = focus[scene.id] ?? [centerX / grid, centerY / grid];
    const irisX = Math.max(left + halfWidth * .50, Math.min(right - halfWidth * .50, fx * grid));
    const irisY = Math.max(top + halfHeight * .50, Math.min(bottom - halfHeight * .50, fy * grid));
    const radius = Math.hypot(halfWidth + Math.abs(irisX - centerX), halfHeight + Math.abs(irisY - centerY));
    const closed = 1 - openness;
    const direction = incoming ? -1 : 1;
    const irisScale = 1 - .30 * closed;
    const aperture = radius * openness ** .68 * irisScale;
    const facing = openness;
    const depth = Math.sqrt(1 - facing * facing) * direction * .37;
    const block = style === 'mosaic' ? 1 + Math.floor(closed * 5) : 1;
    const mosaicX = Math.round(irisX), mosaicY = Math.round(irisY);
    const mosaicWidth = openness ** .88;
    const mosaicHeight = openness ** .58;
    const scanHeight = openness ** 1.34;
    const scanCenter = centerY + direction * closed * halfHeight * .15;
    const accent = frame.palette.indexOf(scene.accent);
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        let sx = x + .5, sy = y + .5, highlight = false;
        if (style === 'iris') {
          const dx = sx - irisX, dy = sy - irisY;
          const distance = Math.hypot(dx, dy);
          if (distance > aperture) continue;
          sx = irisX + dx / irisScale;
          sy = irisY + dy / irisScale;
          highlight = aperture - distance < 1.4 && openness < .78 && Math.abs(dx) > Math.abs(dy) * 2.5;
        } else if (style === 'hinge') {
          const dx = sx - centerX;
          const projection = facing - depth * dx / halfWidth;
          if (projection <= 0) continue;
          sx = centerX + dx / projection;
          sy = centerY + (sy - centerY - dx * depth * .14) * (1 + depth * (sx - centerX) / halfWidth);
          highlight = openness < .52 && Math.abs(sx - (incoming ? left : right)) < 2;
        } else if (style === 'mosaic') {
          const dx = mosaicX + (Math.floor((x - mosaicX) / block) + .5) * block - irisX;
          const dy = mosaicY + (Math.floor((y - mosaicY) / block) + .5) * block - irisY;
          sx = irisX + dx / mosaicWidth;
          sy = irisY + dy / mosaicHeight;
          highlight = openness < .34 && Math.abs(dx) <= block;
        } else {
          const dy = sy - scanCenter;
          sy = centerY + dy / scanHeight;
          sx = centerX + (sx - centerX) / (1 + closed * .20);
          highlight = openness < .46 && Math.abs(dy) < 1;
        }
        if (sx < left || sx >= right || sy < top || sy >= bottom) continue;
        const sourceX = Math.floor(sx) * unit, sourceY = Math.floor(sy) * unit;
        const center = Math.floor(unit / 2);
        const tile = block > 1 ? frame.pixels[(sourceY + center) * size + sourceX + center] : null;
        for (let dy = 0; dy < unit; dy++) {
          const from = (sourceY + dy) * size + sourceX;
          const to = (y * unit + dy) * size + x * unit;
          for (let dx = 0; dx < unit; dx++) {
            const ink = tile ?? frame.pixels[from + dx];
            pixels[to + dx] = ink && highlight && accent > 0 ? accent : ink;
          }
        }
      }
    }
    return { ...frame, pixels };
  }

  function renderTimeline(clips, duration, seconds, size = 100, { transition = true } = {}) {
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

  const api = { ...createTimeline(galleryOrder), frameRate, createTimeline };
  if (commonJS) module.exports = api;
  else root.PixelMotion = api;
})(globalThis);
