/* Encode the artwork grid directly. Screen scale and device density are not inputs. */
(function (root) {
  'use strict';

  const motion = typeof module !== 'undefined' && module.exports
    ? require('./motion.js')
    : root.PixelMotion;
  const ascii = value => Uint8Array.from(value, character => character.charCodeAt(0));
  const littleEndian = value => [value & 255, value >>> 8];

  function concat(parts) {
    const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  }

  function paletteBytes(colors) {
    return Uint8Array.from(colors.flatMap(color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16))));
  }

  function samplePositions(cells, size) {
    return Uint16Array.from({ length: size }, (_, index) => Math.floor((index + .5) * cells / size));
  }

  const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
    let crc = value;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    return crc;
  });

  function pngChunk(type, data) {
    const bytes = new Uint8Array(data.length + 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, data.length);
    bytes.set(ascii(type), 4);
    bytes.set(data, 8);
    let crc = 0xffffffff;
    for (let i = 4; i < bytes.length - 4; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    view.setUint32(bytes.length - 4, crc ^ 0xffffffff);
    return bytes;
  }

  // PNG accepts stored DEFLATE blocks. Indexed rows use 1–8 bits per source pixel.
  function zlib(bytes) {
    const blockSize = 65535;
    const result = new Uint8Array(2 + bytes.length + 5 * Math.ceil(bytes.length / blockSize) + 4);
    const view = new DataView(result.buffer);
    result.set([0x78, 0x01]);
    let a = 1, b = 0, offset = 2;
    for (let start = 0; start < bytes.length; start += blockSize) {
      const block = bytes.subarray(start, start + blockSize);
      result[offset] = start + block.length === bytes.length ? 1 : 0;
      view.setUint16(offset + 1, block.length, true);
      view.setUint16(offset + 3, block.length ^ 65535, true);
      result.set(block, offset + 5);
      offset += block.length + 5;
      for (const value of block) { a += value; b += a; }
      a %= 65521;
      b %= 65521;
    }
    view.setUint32(offset, (b << 16) | a);
    return result;
  }

  function encodePng(frame, size) {
    const colors = frame.palette.length;
    const depth = colors <= 2 ? 1 : colors <= 4 ? 2 : colors <= 16 ? 4 : 8;
    const stride = 1 + Math.ceil(size * depth / 8);
    const positions = samplePositions(frame.size, size);
    const rows = new Uint8Array(stride * size);
    for (let y = 0; y < size; y++) {
      const source = positions[y] * frame.size;
      const row = y * stride + 1;
      for (let x = 0; x < size; x++) {
        const bit = x * depth;
        rows[row + (bit >>> 3)] |= frame.pixels[source + positions[x]] << (8 - depth - (bit & 7));
      }
    }
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, size);
    view.setUint32(4, size);
    header.set([depth, 3], 8); // Bit depth and indexed color type.
    return concat([
      Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
      pngChunk('IHDR', header),
      pngChunk('PLTE', paletteBytes(frame.palette)),
      pngChunk('IDAT', zlib(rows)),
      pngChunk('IEND', new Uint8Array())
    ]);
  }

  function changedBounds(before, after, size) {
    if (!before) return { left: 0, top: 0, right: size, bottom: size };
    let left = size, top = size, right = 0, bottom = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = y * size + x;
        if (before[index] === after[index]) continue;
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = y + 1;
      }
    }
    return left < right ? { left, top, right, bottom } : null;
  }

  function lzw(pixels, cells, positions, rect, minimum) {
    const clear = 1 << minimum;
    const end = clear + 1;
    const dictionary = new Uint16Array(4096 * clear);
    const packed = [];
    let next = end + 1, width = minimum + 1;
    let bits = 0, pending = 0;

    function write(code) {
      pending |= code << bits;
      bits += width;
      while (bits >= 8) {
        packed.push(pending & 255);
        pending >>>= 8;
        bits -= 8;
      }
    }

    write(clear);
    let prefix = pixels[positions[rect.top] * cells + positions[rect.left]];
    for (let y = rect.top; y < rect.bottom; y++) {
      const row = positions[y] * cells;
      const first = y === rect.top ? rect.left + 1 : rect.left;
      for (let x = first; x < rect.right; x++) {
        const symbol = pixels[row + positions[x]];
        const key = prefix * clear + symbol;
        const found = dictionary[key];
        if (found) {
          prefix = found;
          continue;
        }
        write(prefix);
        // A GIF decoder adds the previous entry as it reads this code.
        if (next === (1 << width) && width < 12) width++;
        if (next < 4096) dictionary[key] = next++;
        else {
          write(clear);
          dictionary.fill(0);
          next = end + 1;
          width = minimum + 1;
        }
        prefix = symbol;
      }
    }
    write(prefix);
    if (next === (1 << width) && width < 12) width++;
    write(end);
    if (bits) packed.push(pending & 255);

    const blocks = new Uint8Array(packed.length + Math.ceil(packed.length / 255) + 1);
    let offset = 0;
    for (let index = 0; index < packed.length; index += 255) {
      const block = packed.slice(index, index + 255);
      blocks[offset++] = block.length;
      blocks.set(block, offset);
      offset += block.length;
    }
    return blocks;
  }

  function gifFrame({ rect, delay, data, palette, minimum }) {
    const table = new Uint8Array((1 << minimum) * 3);
    table.set(paletteBytes(palette));
    return [
      Uint8Array.of(0x21, 0xf9, 4, 4, ...littleEndian(delay), 0, 0,
        0x2c, ...littleEndian(rect.left), ...littleEndian(rect.top),
        ...littleEndian(rect.right - rect.left), ...littleEndian(rect.bottom - rect.top), 0x80 | (minimum - 1)),
      table,
      Uint8Array.of(minimum),
      data
    ];
  }

  async function encodeGif(size, { clipIndex, onProgress = () => {} } = {}) {
    const clips = clipIndex === undefined ? motion.clips : [motion.clips[clipIndex]];
    const start = clips[0].start;
    const end = clips.at(-1).end;
    const chunks = [
      ascii('GIF89a'),
      Uint8Array.of(...littleEndian(size), ...littleEndian(size), 0xf0, 0, 0),
      Uint8Array.of(0, 0, 0, 255, 255, 255),
      Uint8Array.of(0x21, 0xff, 11, ...ascii('NETSCAPE2.0'), 3, 1, 0, 0, 0)
    ];
    const fps = motion.frameRate;
    const frameCount = Math.round((end - start) * fps);
    const playback = { transition: clipIndex === undefined };
    const sampling = new Map();

    let previous, previousPalette, previousSize, pending;
    let batchStart = performance.now();
    for (let i = 0; i < frameCount; i++) {
      const { frame } = motion.frameAt(start + i / fps, size, playback);
      const { size: cells, pixels, palette } = frame;
      if (!sampling.has(cells)) {
        const positions = samplePositions(cells, size);
        const edges = new Uint16Array(cells + 1).fill(size);
        let edge = 0;
        for (let x = 0; x < size; x++) while (edge <= positions[x]) edges[edge++] = x;
        sampling.set(cells, { positions, edges });
      }
      const { positions, edges } = sampling.get(cells);
      const minimum = Math.max(2, Math.ceil(Math.log2(palette.length)));
      // Every scene keeps its own source colors. A new palette needs a full frame,
      // even when its index numbers happen to match the preceding image.
      const changed = changedBounds(previousPalette === palette && previousSize === cells ? previous : undefined, pixels, cells);
      if (changed) {
        const rect = {
          left: edges[changed.left], top: edges[changed.top],
          right: edges[changed.right], bottom: edges[changed.bottom]
        };
        // A change between two export samples has no visible rectangle.
        if (rect.left < rect.right && rect.top < rect.bottom) {
          if (pending) chunks.push(...gifFrame(pending));
          pending = { rect, delay: 0, data: lzw(pixels, cells, positions, rect, minimum), palette, minimum };
          previous = pixels;
          previousPalette = palette;
          previousSize = cells;
        }
      }
      // Round cumulative time so the total length and the logo cuts stay exact.
      pending.delay += Math.round((i + 1) * 100 / fps) - Math.round(i * 100 / fps);
      if (performance.now() - batchStart >= 14) {
        onProgress((i + 1) / frameCount);
        await new Promise(resolve => setTimeout(resolve, 0));
        batchStart = performance.now();
      }
    }
    chunks.push(...gifFrame(pending), Uint8Array.of(0x3b));
    onProgress(1);
    return concat(chunks);
  }

  const api = { encodePng, encodeGif };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PixelExport = api;
})(globalThis);
