// Build the share image and the icons in assets/.
// Usage: node tools/build-assets.mjs <InstrumentSerif-Italic.ttf> <Geist.ttf>
// Needs rsvg-convert (librsvg) on the PATH. Text is turned into outlines with
// HarfBuzz, so the images do not depend on installed fonts.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as hb from '../vendor/harfbuzzjs/index.mjs';
import { makeShaper } from '../src/shape-core.js';
import { wordToPhonemes } from '../src/g2p.js';
import { toDuployan } from '../src/duploye.js';

const [serifPath, sansPath] = process.argv.slice(2);
if (!serifPath || !sansPath) { console.error('Usage: node tools/build-assets.mjs <InstrumentSerif-Italic.ttf> <Geist.ttf>'); process.exit(1); }
const root = new URL('..', import.meta.url);
const load = (p) => {
  const b = readFileSync(p);
  const face = new hb.Face(new hb.Blob(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
  return { shape: makeShaper(hb, new hb.Font(face)), upem: face.upem };
};
const steno = load(new URL('fonts/NotoSansDuployan-Regular.ttf', root));
const stenoBold = load('/usr/share/fonts/noto/NotoSansDuployan-Bold.ttf');
const serif = load(serifPath), sans = load(sansPath);

// text -> <g> of outlines at (x, baseline y), size in px; returns {svg, width}
function text(f, str, x, y, size, fill) {
  const s = f.shape(str), k = size / f.upem;
  const paths = s.glyphs.map((g) => `<path d="${g.d}" transform="translate(${g.x},${g.y})"/>`).join('');
  return { svg: `<g transform="translate(${x},${y}) scale(${k},${-k})" fill="${fill}">${paths}</g>`, width: (s.box.x1 - s.box.x0) * k, box: s.box, k };
}
const shorthand = (fr) => fr.split(' ').map((w) => toDuployan(wordToPhonemes(w))).join(' ');

const INK = '#1b2440', ACCENT = '#2743b8', MUTED = '#7b8193', DOT = '#d3d8e3';
const dots = (w, h, step) => `<defs><pattern id="d" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><circle cx="${step / 2}" cy="${step / 2}" r="1.6" fill="${DOT}"/></pattern></defs><rect width="${w}" height="${h}" fill="#fff"/><rect width="${w}" height="${h}" fill="url(#d)"/>`;

// ---------- share image, 1200 x 630 ----------
{
  const W = 1200, H = 630;
  const title = text(serif, 'Duployé Transcriber', 88, 214, 104, INK);
  const sub = text(sans, 'French & English → Duployé shorthand', 92, 282, 34, MUTED);
  const sub2 = text(sans, 'Canvas · Lessons · Flashcards · Embed', 92, 330, 26, MUTED);
  // a line of real shorthand, written by the same font as the site, centred in a band
  const BAND_TOP = 372, BAND_BOTTOM = 548, mid = (BAND_TOP + BAND_BOTTOM) / 2;
  const shapes = ['sténographie', 'Duployé'].map((w) => steno.shape(toDuployan(wordToPhonemes(w))));
  const tallest = Math.max(...shapes.map((s) => s.box.y1 - s.box.y0));
  const k = Math.min((BAND_BOTTOM - BAND_TOP) / tallest, 0.11);
  let x = 96;
  const parts = shapes.map((s) => {
    const cy = (s.box.y0 + s.box.y1) / 2;
    const gx = x - s.box.x0 * k, gy = mid + cy * k;
    x += (s.box.x1 - s.box.x0) * k + 72;
    return `<g transform="translate(${gx},${gy}) scale(${k},${-k})" fill="${ACCENT}">${s.glyphs.map((g) => `<path d="${g.d}" transform="translate(${g.x},${g.y})"/>`).join('')}</g>`;
  });
  const gloss = text(sans, 'sténographie Duployé', 96, 590, 22, MUTED);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${dots(W, H, 30)}${title.svg}${sub.svg}${sub2.svg}${parts.join('')}${gloss.svg}</svg>`;
  mkdirSync(new URL('assets/', root), { recursive: true });
  writeFileSync(new URL('assets/og.svg', root), svg);
  execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-o', fileURLToPath(new URL('assets/og.png', root)), fileURLToPath(new URL('assets/og.svg', root))]);
}

// ---------- icon: a stroke and a loop (L + o) in white on ink blue ----------
{
  const s = stenoBold.shape(toDuployan(['L', 'o']));
  const b = s.box, pad = 0.2 * Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const size = Math.max(b.x1 - b.x0, b.y1 - b.y0) + 2 * pad;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const paths = s.glyphs.map((g) => `<path d="${g.d}" transform="translate(${g.x},${g.y})"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${ACCENT}"/><g transform="translate(32,32) scale(${44 / size},${-44 / size}) translate(${-cx},${-cy})" fill="#fff">${paths}</g></svg>`;
  writeFileSync(new URL('assets/icon.svg', root), svg);
  for (const [px, name] of [[48, 'icon-48.png'], [180, 'apple-touch-icon.png'], [512, 'icon-512.png']]) {
    execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), '-o', fileURLToPath(new URL(`assets/${name}`, root)), fileURLToPath(new URL('assets/icon.svg', root))]);
  }
}
console.log('assets/og.png, assets/icon.svg and PNG icons written');
