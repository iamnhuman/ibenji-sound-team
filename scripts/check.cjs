'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { scenes, render, rgba } = require('../pixel-art.js');
const originals = require('../pixel-originals.js');
const { clips, duration, frameAt } = require('../motion.js');
const { encodePng, encodeGif } = require('../pixel-export.js');
const brand = require('../brand.js');
const resolutions = [1000, 500, 200, 100, 50];
assert.deepEqual(clips.map(({ scene }) => scene.id), [
  'eye', 'girl', 'skull', 'scream', 'wave', 'violet', 'blood-eye', 'orbit', 'specter', 'spine', 'satellite', 'crt', 'planet', 'torii', 'thermal',
  'lunar-cat', 'broken-computer', 'cyber-hand', 'pocket-pet', 'hazard', 'candy', 'chrome', 'slime', 'radiation',
  'space-emblem', 'red-bulls', 'red-vector', 'metal-mark',
  'console', 'foot-stamp', 'stream-disc', 'violet-player', 'carnival', 'prancing-horse', 'crocodile', 'chroma-note', 'golden-harp', 'mecha-ouroboros'
]);
assert.deepEqual(scenes.map(scene => scene.number), Array.from({ length: 40 }, (_, index) => index + 1).filter(number => number !== 25 && number !== 32));
assert.deepEqual([...new Set(clips.map(clip => clip.cutStyle))], ['iris', 'beam', 'splice', 'cascade']);
assert.equal(duration, 114);
for (const scene of scenes) {
  assert(fs.existsSync(path.resolve(__dirname, '../img/done', scene.source)), 'A completed source must be in done');
  assert(!fs.existsSync(path.resolve(__dirname, '../img/todo', scene.source)), 'A completed source must leave todo');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../img/done', scene.source))).digest('hex'),
    scene.sourceHash, 'Every pixel atlas must come from its current original PNG');
  assert(scene.palette.length <= 32, 'Each scene must retain a compact palette with distinct color steps');
}

for (const size of [50, 100, 112, 125, 144]) {
  for (const scene of scenes) {
    const original = originals.baseFrame(scene.id, size);
    assert.deepEqual(render(scene.id, size).pixels, original.pixels,
      'A resting logo must match the generated source artwork');
    const [ox, oy, width, height] = scene.placement;
    for (const time of [.46, 1.1, 2.3]) {
      const moving = render(scene.id, size, time);
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
        for (let row = top; row < bottom; row++) assert.deepEqual(
          moving.pixels.subarray(row * size + left, row * size + right),
          original.pixels.subarray(row * size + left, row * size + right),
          'Animation must preserve the original font: ' + scene.id
        );
      }
    }
  }
}

function validateFrame(frame, size) {
  assert.equal(frame.size, size);
  assert.equal(frame.pixels.length, size * size);
  let artwork = 0;
  for (const color of frame.pixels) {
    assert(color < frame.palette.length, 'Every cell must use an indexed palette color');
    if (color) artwork++;
  }
  assert(artwork > 0 && artwork < frame.pixels.length, 'The logo must stay visible against black');
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
  for (const [index, clip] of clips.entries()) {
    const first = frameAt(clip.start, size);
    const moving = frameAt(clip.start + .46, size);
    const clipGrid = clip.scene.artworkGrids?.[size];
    if (clipGrid) assert.equal(first.frame.artworkSize ?? first.frame.size, clipGrid);
    const frameSize = clipGrid ? first.frame.size : grid;
    assert.equal(first.index, index, 'Seeking to a clip must show that clip immediately');
    assert.equal(first.progress, 0);
    assert.notDeepEqual(moving.frame.pixels, first.frame.pixels, 'Each logo must move before its cut');
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
for (const clip of clips.filter(({ scene }) => scene.captions)) {
  const [left, top, width, height] = clip.scene.placement;
  const caption = clip.scene.captions[0];
  for (const size of [200, 500, 1000]) {
    const { frame } = frameAt(clip.start, size);
    const [x, y, w, h] = size === 200 && caption.compactRect ? caption.compactRect : caption.rect;
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
for (const id of ['film-prev', 'filmstrip', 'film-next', 'gif-full', 'gif-current']) assert(html.includes(`id="${id}"`));
for (const file of ['style.css', 'pixel-originals.js', 'eye-motion.js', 'pixel-art.js', 'motion.js', 'pixel-export.js', 'brand.js', 'app.js']) assert(html.includes(`"${file}"`));
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
  for (const [size, clipIndex, expectedDuration] of [[50, undefined, duration], [1000, undefined, duration], [50, 1, 3], [200, 9, 3]]) {
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
