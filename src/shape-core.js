// Shaping core, shared by the main thread and the shaping worker.
// The Noto Sans Duployan font does the hard part (cursive joins, vowel
// orientation); we only collect the visible glyphs and their pen positions.

// Bounding box from the absolute coordinates HarfBuzz emits (control points
// included, which is a safe over-estimate).
function pathBox(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  if (!nums) return null;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = +nums[i], y = +nums[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

// Round long float coordinates: smaller DOM, same look at any zoom.
const tidy = (d) => d.replace(/-?\d+\.\d+/g, (n) => (+n).toFixed(1));

const GAP = 110;  // font units between a vowel and the accent drawn above it

/**
 * Returns shapeText(text) -> {glyphs, box} for a loaded HarfBuzz font.
 * The grave accent (U+0300, our mark for open vowels) is placed by the font inside the
 * vowel, inside the circle of ò, where it could be read as the dot of ou. We lift it
 * above its vowel, centred, and flag it so it can be drawn in the accent colour.
 * Only that glyph moves: the dots of GN, Z, CH and TH are marks too and stay put.
 */
export function makeShaper(hb, font) {
  const accentGid = typeof font.nominalGlyph === 'function' ? font.nominalGlyph(0x300) : null;
  const paths = new Map(); // glyph id -> outline (most glyphs are invisible joiners)
  const pathOf = (gid) => {
    let p = paths.get(gid);
    if (p === undefined) { p = font.glyphToPath(gid); paths.set(gid, p ? tidy(p) : ''); p = paths.get(gid); }
    return p;
  };
  return function shapeText(text) {
    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(font, buffer);
    const out = [];
    let px = 0, py = 0;
    let X0 = 0, Y0 = 0, X1 = 0, Y1 = 0, first = true, base = null;
    for (const g of buffer.getGlyphInfosAndPositions()) {
      const d = pathOf(g.codepoint);
      if (d) {
        let x = px + (g.xOffset || 0), y = py + (g.yOffset || 0);
        const b = pathBox(d);
        const mark = accentGid != null && g.codepoint === accentGid;
        if (b && mark && base) {
          // centre over the vowel, a little above its top
          x = (base.x0 + base.x1) / 2 - (b.x0 + b.x1) / 2;
          y = base.y1 + GAP - b.y0;
        }
        if (b) {
          const box = { x0: b.x0 + x, y0: b.y0 + y, x1: b.x1 + x, y1: b.y1 + y };
          if (first) { X0 = box.x0; Y0 = box.y0; X1 = box.x1; Y1 = box.y1; first = false; }
          else { X0 = Math.min(X0, box.x0); Y0 = Math.min(Y0, box.y0); X1 = Math.max(X1, box.x1); Y1 = Math.max(Y1, box.y1); }
          out.push({ d, x, y, box: b, len: Math.hypot(b.x1 - b.x0, b.y1 - b.y0), ...(mark ? { mark: true } : {}) });
          if (!mark) base = box;
        }
      }
      px += g.xAdvance || 0;
      py += g.yAdvance || 0;
    }
    buffer.destroy?.();
    return { glyphs: out, box: { x0: Math.min(X0, 0), y0: Math.min(Y0, 0), x1: Math.max(X1, 0), y1: Math.max(Y1, 0) } };
  };
}
