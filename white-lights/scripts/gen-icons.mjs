/* Generate the PWA icon set: dark tile + the three white lights.
   Pure JS (pngjs) so it runs anywhere with no native build step.
   Run: npm run icons */
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');
mkdirSync(outDir, { recursive: true });

const BG = [16, 18, 20]; // #101214
const DOT = [237, 237, 232]; // #EDEDE8

function draw(size, { maskable = false } = {}) {
  const png = new PNG({ width: size, height: size });
  // rounded-rect radius (0 for maskable — the platform masks it)
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const cy = size / 2;
  const r = size * (maskable ? 0.085 : 0.1); // dot radius
  const gap = size * (maskable ? 0.2 : 0.235);
  const cxs = [cy - gap, cy, cy + gap];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      let col = BG;
      // rounded corners -> transparent
      let transparent = false;
      if (radius > 0) {
        const rx = Math.min(x, size - 1 - x);
        const ry = Math.min(y, size - 1 - y);
        if (rx < radius && ry < radius) {
          const dx = radius - rx;
          const dy = radius - ry;
          if (dx * dx + dy * dy > radius * radius) transparent = true;
        }
      }
      for (const cx of cxs) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) col = DOT;
      }
      png.data[idx] = col[0];
      png.data[idx + 1] = col[1];
      png.data[idx + 2] = col[2];
      png.data[idx + 3] = transparent ? 0 : 255;
    }
  }
  return PNG.sync.write(png);
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
];

for (const [name, size, opts] of targets) {
  writeFileSync(resolve(outDir, name), draw(size, opts));
  console.log('wrote', name, `(${size}px)`);
}
