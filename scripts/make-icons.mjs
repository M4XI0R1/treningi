// Generuje ikony aplikacji (PNG) bez zależności: grafitowe tło (Obsidian Ink), białe hantle.
// Uruchom: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x1c, 0x1c, 0x1e];
const FG = [0xff, 0xff, 0xff];

// Kształty w jednostkach 0..1 (środek ikony = 0.5). Całość mieści się w kole
// o promieniu 0.32, więc zostaje w bezpiecznej strefie maski (r = 0.4).
const half = [
  { x0: 0.34, x1: 0.66, y0: 0.478, y1: 0.522, r: 0.01 }, // gryf
  { x0: 0.285, x1: 0.345, y0: 0.335, y1: 0.665, r: 0.022 }, // duży talerz
  { x0: 0.225, x1: 0.28, y0: 0.385, y1: 0.615, r: 0.02 }, // mały talerz
  { x0: 0.19, x1: 0.222, y0: 0.462, y1: 0.538, r: 0.01 }, // zacisk
];
const shapes = half.flatMap((s) =>
  s.x0 === 0.34 ? [s] : [s, { ...s, x0: 1 - s.x1, x1: 1 - s.x0 }],
);

function insideRoundRect(x, y, s) {
  if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) return false;
  const cx = Math.min(Math.max(x, s.x0 + s.r), s.x1 - s.r);
  const cy = Math.min(Math.max(y, s.y0 + s.r), s.y1 - s.r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= s.r ** 2;
}

function render(size, scale = 1) {
  const ss = 4; // supersampling dla gładkich krawędzi
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = ((pxi + (sx + 0.5) / ss) / size - 0.5) / scale + 0.5;
          const v = ((py + (sy + 0.5) / ss) / size - 0.5) / scale + 0.5;
          if (shapes.some((s) => insideRoundRect(u, v, s))) hits++;
        }
      }
      const a = hits / (ss * ss);
      const i = (py * size + pxi) * 4;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
      px[i + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, 1.25));
writeFileSync('public/icons/icon-512.png', render(512, 1.25));
writeFileSync('public/icons/icon-maskable-512.png', render(512, 1));
writeFileSync('public/icons/apple-touch-icon.png', render(180, 1.2));
writeFileSync('public/icons/favicon-64.png', render(64, 1.35));
console.log('Ikony zapisane w public/icons/');
