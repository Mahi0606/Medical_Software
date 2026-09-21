// Generates PWA icons (solid accent tile with a white plus) without any image library.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = draw(x, y); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const accent = [0x1e, 0x5a, 0x8a];
for (const size of [192, 512]) {
  const r = size * 0.18, pad = size * 0.06;
  const img = png(size, (x, y) => {
    const inTile = (() => { const x0 = pad, y0 = pad, x1 = size - pad, y1 = size - pad; if (x < x0 || x > x1 || y < y0 || y > y1) return false; const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; })();
    if (!inTile) return [0, 0, 0, 0];
    const cx = size / 2, cy = size / 2, arm = size * 0.11, len = size * 0.3;
    const plus = (Math.abs(x - cx) < arm && Math.abs(y - cy) < len) || (Math.abs(y - cy) < arm && Math.abs(x - cx) < len);
    return plus ? [255, 255, 255, 255] : [...accent, 255];
  });
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), img);
}
console.log('icons written');
