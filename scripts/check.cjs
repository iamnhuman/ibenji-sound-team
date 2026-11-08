'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { scenes, render, rgba } = require('../pixel-art.js');
const originals = require('../pixel-originals.js');
const motion = require('../motion.js');
const { clips, duration, frameAt } = motion.createTimeline();
const { encodePng, encodeGif } = require('../pixel-export.js');
const brand = require('../brand.js');
const referenceLettering = require('./reference-lettering.cjs');
const resolutions = [1000, 500, 200, 100, 50];
assert.deepEqual(clips.map(({ scene }) => scene.id), [
  'eye', 'girl', 'skull', 'scream', 'wave', 'violet', 'blood-eye', 'orbit', 'specter', 'spine', 'satellite', 'crt', 'planet', 'torii', 'thermal',
  'broken-computer', 'cyber-hand', 'pocket-pet', 'hazard', 'candy', 'chrome', 'slime',
  'space-emblem', 'red-bulls', 'red-vector', 'metal-mark',
  'console', 'foot-stamp', 'stream-disc', 'violet-player', 'carnival', 'prancing-horse', 'crocodile', 'chroma-note', 'golden-harp', 'mecha-ouroboros',
  'ring-mark', 'red-roof', 'winged-shoe', 'green-eye', 'umbrella', 'flame-crest',
  'neon-orbit', 'acid-cabinet', 'iron-sigil', 'terminal-crt', 'marionette', 'twin-diamond',
  'alien-noise', 'reactor-spine', 'barcode-eye', 'ink-tag', 'ikea-instructions', 'three-stripes',
  'chaotic-cat', 'triple-diamond', 'mountain-break', 'streaming-n', 'soda-globe',
  'shell-rays', 'back-to-back', 'flight-swoosh', 'play-badge', 'red-tab', 'oval-steel', 'blue-ellipse',
  'race-stripes', 'arcade-sun', 'retro-distortion', 'ritual-cat', 'toxic-feet',
  'pixel-hand', 'dripping-ink', 'trail-arches', 'star-chevron', 'twin-discs', 'paper-scream', 'purple-chat',
  'bowtie-rabbit', 'fire-fox', 'red-brick', 'citrus-leaf', 'coffee-seal', 'red-turbine', 'tire-mascot',
  'mountain-arches', 'chrome-ellipses', 'grand-prix', 'neural-drink',
  'xbox-orb', 'chip-mascot', 'mushroom-emblem'
]);
assert.deepEqual(clips.map(clip => clip.number), Array.from({ length: clips.length }, (_, index) => index + 1));
assert.deepEqual([...new Set(clips.map(clip => clip.cutStyle))], ['iris', 'hinge', 'mosaic', 'sync']);
assert.equal(duration, 276);
const catalogIds = clips.map(clip => clip.scene.id);
const saved = require('../gallery-order.js');
const visibleIds = [...new Set([...saved.ids, ...catalogIds])].filter(id => catalogIds.includes(id) && !saved.removed.includes(id));
assert.deepEqual(motion.clips.map(clip => clip.scene.id), visibleIds);
assert.deepEqual(motion.clips.map(clip => clip.number), visibleIds.map((_id, index) => index + 1));
const edited = motion.createTimeline({ ids: [catalogIds[2], catalogIds[0]], removed: [catalogIds[1]] });
assert.deepEqual(edited.clips.slice(0, 3).map(clip => [clip.scene.id, clip.number, clip.start]), [
  [catalogIds[2], 1, 0], [catalogIds[0], 2, 3], [catalogIds[3], 3, 6]
]);
assert.equal(edited.duration, duration - 3);
assert.deepEqual(edited.frameAt(3, 100).frame, frameAt(0, 100).frame);
const wordmarks = Object.values(referenceLettering).map(([line]) => line.bitmap.join('/'));
assert.equal(new Set(wordmarks).size, wordmarks.length, 'Each adapted wordmark must have its own silhouette');
for (const scene of scenes) {
  assert(fs.existsSync(path.resolve(__dirname, '../img/done', scene.source)), 'A completed source must be in done');
  assert(!fs.existsSync(path.resolve(__dirname, '../img/todo', scene.source)), 'A completed source must leave todo');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../img/done', scene.source))).digest('hex'),
    scene.sourceHash, 'Every pixel atlas must come from its current original PNG');
  assert(scene.palette.length <= 32, 'Each scene must retain a compact palette with distinct color steps');
  assert(scene.palette.every(color => /^#[0-9a-f]{6}$/i.test(color)), 'Every palette entry must be a valid RGB color');
}

for (const size of [50, 100, 112, 125, 144]) {
  for (const scene of scenes) {
    const original = originals.baseFrame(scene.id, size);
    assert.deepEqual(render(scene.id, size).pixels, original.pixels,
      'A resting logo must match the generated source artwork');
    const [ox, oy, width, height] = scene.placement;
    for (const time of [.46, 1.1, 2.3]) {
      const moving = render(scene.id, size, time);
      if (scene.motion === 'red-roof' || scene.motion === 'ink-drips') {
        for (const [index, ink] of original.pixels.entries()) {
          if (ink) assert.equal(moving.pixels[index], ink, 'Particles must leave the original strokes intact');
        }
        continue;
      }
      if (scene.motion === 'disc') {
        const logo = Math.ceil(size * .421) * size;
        assert.deepEqual(moving.pixels.subarray(logo), original.pixels.subarray(logo),
          'The record must turn behind the lettering');
        continue;
      }
      if (scene.motion === 'ring-mark') {
        // The circle and wordmark turn on separate planes with visible depth.
        assert(moving.pixels.some(ink => ink === scene.palette.indexOf('#41505e')),
          'The turned emblem must show its metal edge');
        continue;
      }
      if (scene.id === 'eye') for (let cell = 0; cell < original.pixels.length; cell++) {
        const x = (cell % size + .5) / size, y = (Math.floor(cell / size) + .5) / size;
        if (x >= .393 && x <= .609 && y >= .232 && y <= .306) continue;
        const root = y >= .304 && y <= .50 && (x < .109 || x > .885 ||
          (x > .178 && x < .235) || (x > .29 && x < .356) || (x > .595 && x < .665));
        if (root) continue;
        if (original.pixels[cell] === scene.palette.indexOf('#ffffff')) {
          assert.equal(moving.pixels[cell], original.pixels[cell], 'The wing outlines must survive the blink');
        }
      }
      for (const [x, y, w, h] of scene.text) {
        const left = Math.max(0, Math.floor((ox + x * width) * size));
        const right = Math.min(size, Math.ceil((ox + (x + w) * width) * size));
        const top = Math.max(0, Math.floor((oy + y * height) * size));
        const bottom = Math.min(size, Math.ceil((oy + (y + h) * height) * size));
        const transparent = scene.motion === 'mecha-ouroboros' || scene.motion === 'chrome-badge';
        for (let row = top; row < bottom; row++) {
          const start = row * size + left, end = row * size + right;
          if (transparent) {
            for (let index = start; index < end; index++) {
              if (original.pixels[index]) assert.equal(moving.pixels[index], original.pixels[index],
                'Layered artwork must preserve the letter strokes: ' + scene.id);
            }
          } else assert.deepEqual(moving.pixels.subarray(start, end), original.pixels.subarray(start, end),
            'Animation must preserve the original font: ' + scene.id);
        }
      }
    }
  }
}

function validateFrame(frame, size) {
  assert.equal(frame.size, size);
  assert.equal(frame.pixels.length, size * size);
  let distinct = false;
  for (const color of frame.pixels) {
    assert(color < frame.palette.length, 'Every cell must use an indexed palette color');
    if (color !== frame.pixels[0]) distinct = true;
  }
  assert(distinct, 'The logo must stay visible against its background');
  const bytes = rgba(frame);
  assert.equal(bytes.length, size * size * 4);
  for (let offset = 3; offset < bytes.length; offset += 4) {
    assert.equal(bytes[offset], 255, 'Rendered pixels must be opaque');
  }
}

let lastGrid = Infinity;
for (const size of resolutions) {
  const firstFrame = frameAt(0, size).frame;
  const grid = firstFrame.size;
  const artworkGrid = firstFrame.artworkSize ?? grid;
  assert(artworkGrid <= 144 && artworkGrid < lastGrid, 'Each preset must have a distinct, visibly coarse artwork grid');
  assert(size >= 200 ? grid >= 200 && grid > artworkGrid : grid === artworkGrid,
    'Detailed lettering starts at 200 px');
  lastGrid = artworkGrid;
  const girlStart = clips.find(clip => clip.scene.id === 'girl').start;
  function tongueTip(time) {
    const { pixels, palette } = frameAt(girlStart + time, size).frame;
    const pink = palette.indexOf('#ed08eb');
    for (let y = Math.ceil(grid * .69) - 1; y >= Math.floor(grid * .55); y--) {
      for (let x = Math.ceil(grid * .535); x < Math.floor(grid * .604); x++) {
        if (pixels[y * grid + x] === pink) return y;
      }
    }
    return -1;
  }
  const rest = tongueTip(0), long = tongueTip(.46), short = tongueTip(1.45);
  assert(rest >= 0 && long > short && short > rest, 'Both tongue extensions must be visible at every pixel size');
  assert.equal(tongueTip(1.05), rest, 'The tongue must retract between gestures');
  assert.equal(tongueTip(2.1), rest, 'The tongue must retract before the transition');
  const handStart = clips.find(clip => clip.scene.id === 'pixel-hand').start;
  const handFrame = time => frameAt(handStart + time, size).frame;
  const raised = handFrame(0), bent = handFrame(.27);
  function fingerTop({ size, pixels }) {
    for (let y = Math.ceil(size * .281); y < size * .45; y++) {
      for (let x = Math.ceil(size * .397); x < size * .55; x++) {
        if (pixels[y * size + x]) return y;
      }
    }
    return -1;
  }
  assert(fingerTop(raised) >= 0 && fingerTop(bent) >= fingerTop(raised) + raised.size * .074,
    'The middle finger must make a visible fold at every resolution');
  assert.deepEqual(handFrame(.65).pixels, bent.pixels, 'The folded pose must hold steady');
  assert.deepEqual(handFrame(.80).pixels, raised.pixels, 'The finger must snap back to its full extension');
  assert.deepEqual(handFrame(1.23).pixels, bent.pixels, 'The finger must fold a second time');
  assert.deepEqual(handFrame(1.53).pixels, raised.pixels, 'The finger must rise between gestures');
  assert.deepEqual(handFrame(1.96).pixels, bent.pixels, 'The finger must fold a third time');
  assert.deepEqual(handFrame(2.55).pixels, raised.pixels, 'The finger must rise before the transition');
  for (const [index, clip] of clips.entries()) {
    const first = frameAt(clip.start, size);
    const clipGrid = clip.scene.artworkGrids?.[size] ?? artworkGrid;
    assert.equal(first.frame.artworkSize ?? first.frame.size, clipGrid);
    const frameSize = clip.scene.lettering?.[clipGrid]?.size ?? clipGrid;
    let moving;
    for (const time of [.46, .23, .72, .97, 1.38, 1.8, 2.24]) {
      const candidate = frameAt(clip.start + time, size);
      if (candidate.frame.pixels.some((ink, i) => ink !== first.frame.pixels[i])) {
        moving = candidate;
        break;
      }
    }
    assert.equal(first.index, index, 'Seeking to a clip must show that clip immediately');
    assert.equal(first.progress, 0);
    assert(moving, `${clip.scene.id} must move before its cut at ${size} px`);
    validateFrame(first.frame, frameSize);
    validateFrame(moving.frame, frameSize);

    const next = frameAt(clip.end, size);
    const closing = frameAt(clip.end - 4 / 24, size);
    const closed = frameAt(clip.end - 2 / 24, size);
    const opening = frameAt(clip.end - 1 / 24, size);
    const single = frameAt(clip.end - 1 / 24, size, { transition: false });
    assert.equal(closing.index, index);
    assert(closing.frame.pixels.some(pixel => pixel !== 0), 'The outgoing mask must leave a visible partial frame');
    assert(closed.frame.pixels.every(pixel => pixel === 0), 'The mask must close at the cut');
    assert.equal(opening.index, next.index, 'The mask must reveal the incoming scene');
    assert(opening.frame.pixels.some(pixel => pixel !== 0), 'The incoming logo must appear immediately after the cut');
    assert.deepEqual(opening.frame.palette, next.frame.palette, 'Each transition must use the visible logo’s palette');
    validateFrame(opening.frame, next.frame.size);
    assert.equal(single.index, index, 'A single-slide GIF must not include the neighboring logo');
    validateFrame(single.frame, frameSize);
    assert.equal(next.index, (index + 1) % clips.length);
    assert.equal(next.progress, 0);
  }
}

// Thin captions must retain all nine letter groups at the actual export
// resolution, including the smallest detailed lettering preset.
for (const clip of clips) {
  const [left, top, width, height] = clip.scene.placement;
  const caption = clip.scene.captions?.[0] ?? referenceLettering[clip.scene.id]?.find(line => line.text === 'SOUND TEAM');
  if (!caption) continue;
  for (const size of [200, 500, 1000]) {
    const { frame } = frameAt(clip.start, size);
    const [x, y, w, h] = caption.bitmap
      ? [((caption.x ?? .5) - left - caption.width / 2) / width, caption.y - caption.height / 2,
        caption.width / width, caption.height]
      : size === 200 && caption.compactRect ? caption.compactRect : caption.rect;
    const ink = frame.palette.indexOf(caption.ink);
    let groups = 0;
    let previous = false;
    const rows = new Set();
    for (let column = Math.floor((left + x * width) * size); column < Math.ceil((left + (x + w) * width) * size); column++) {
      let present = false;
      const sourceX = Math.floor((column + .5) * frame.size / size);
      for (let row = Math.floor((top + y * height) * size); row < Math.ceil((top + (y + h) * height) * size); row++) {
        const sourceY = Math.floor((row + .5) * frame.size / size);
        if (frame.pixels[sourceY * frame.size + sourceX] !== ink) continue;
        present = true;
        rows.add(row);
      }
      if (present && !previous) groups++;
      previous = present;
    }
    assert.equal(groups, 9, `${clip.scene.id} must retain all nine caption letters at ${size} px`);
    assert(rows.size >= 5, `${clip.scene.id} caption must have room for its strokes at ${size} px`);
  }
}
for (const clip of clips) {
  assert.equal(clip.end - clip.start, 3, 'Logos must change every three seconds');
  assert.deepEqual(frameAt(clip.start, 100).frame.pixels, render(clip.scene.id, clip.scene.artworkGrids?.[100] ?? 100).pixels,
    'Seeking must show the whole logo immediately');
}
assert.deepEqual(frameAt(duration, 100), frameAt(0, 100), 'The sequence must loop back to its first frame');
assert.throws(() => render('missing', 100), /Unknown scene/);
assert.throws(() => render('eye', 1001), /Grid size/);

const cat = brand.frameAt();
const flames = brand.frameAt(.2);
assert.equal(cat.pixels.length, brand.width * brand.height);
assert(flames.pixels.some(color => color >= 4), 'The flames should light up');
assert.notDeepEqual(flames.pixels, brand.frameAt(.31).pixels, 'The fire should move');
assert.deepEqual(flames.pixels.slice(42 * brand.width), cat.pixels.slice(42 * brand.width), 'The lettering and underline should stay still');
for (const [index, color] of cat.pixels.entries()) {
  if (color === 1) assert.equal(flames.pixels[index], 1, 'The fire must stay behind the cat');
}

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
assert.deepEqual([...html.matchAll(/data-size="(\d+)"/g)].map(match => Number(match[1])), resolutions);
assert.match(html, /data-size="500" aria-pressed="true"/);
for (const id of ['film-prev', 'filmstrip', 'film-next', 'gallery-toggle', 'gallery-artwork', 'gallery-grid', 'gallery-edit', 'gallery-save', 'resolution-options', 'gif-full', 'gif-current']) assert(html.includes(`id="${id}"`));
for (const file of ['style.css', 'pixel-originals.js', 'eye-motion.js', 'pixel-art.js', 'gallery-order.js', 'motion.js', 'pixel-export.js', 'brand.js', 'app.js']) assert(html.includes(`"${file}"`));
for (const file of ['pixel-type.js', 'pixel-scenes.js', 'pixel-sprites.js']) assert(!html.includes(file), 'Recreated art and replacement fonts must not be loaded');

function gifDuration(gif) {
  let offset = 13 + 3 * (2 << (gif[10] & 7));
  let delay = 0, frames = 0;
  function skipBlocks() {
    while (gif[offset]) offset += 1 + gif[offset];
    offset++;
  }
  while (offset < gif.length && gif[offset] !== 0x3b) {
    const marker = gif[offset++];
    if (marker === 0x21) {
      const type = gif[offset++];
      if (type === 0xf9) delay += gif.readUInt16LE(offset + 2);
      skipBlocks();
    } else {
      assert.equal(marker, 0x2c, 'Expected a GIF image descriptor');
      const flags = gif[offset + 8];
      offset += 9;
      if (flags & 128) offset += 3 * (2 << (flags & 7));
      offset++;
      skipBlocks();
      frames++;
    }
  }
  assert(frames > 1, 'The GIF must contain animation');
  return delay / 100;
}

async function checkExports() {
  for (const size of resolutions) {
    const png = Buffer.from(encodePng(frameAt(0, size).frame, size));
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    assert.equal(png.readUInt32BE(16), size, 'PNG width must match the selected size');
    assert.equal(png.readUInt32BE(20), size, 'PNG height must match the selected size');
  }
  const last = motion.clips.length - 1;
  for (const [size, clipIndex, expectedDuration] of [[50, undefined, motion.duration], [1000, undefined, motion.duration],
    [50, Math.min(1, last), 3], [200, Math.min(9, last), 3]]) {
    const gif = Buffer.from(await encodeGif(size, { clipIndex }));
    assert.equal(gif.toString('ascii', 0, 6), 'GIF89a');
    assert.equal(gif.readUInt16LE(6), size, 'GIF width must match the selected size');
    assert.equal(gif.readUInt16LE(8), size, 'GIF height must match the selected size');
    assert(gif.includes(Buffer.from('NETSCAPE2.0')), 'The GIF must loop');
    assert.equal(gif.at(-1), 0x3b, 'The GIF must be terminated');
    assert.equal(gifDuration(gif), expectedDuration, 'Full and current slide must export different durations');
  }
  console.log('Passed: five artwork grids, detailed captions, all logo motions, four pixel cuts, header fire, and exact PNG and GIF dimensions.');
}

checkExports().catch(error => { console.error(error); process.exitCode = 1; });
