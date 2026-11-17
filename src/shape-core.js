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

const GAP = 110;      // font units between a vowel and its accent
const CLEAR = 70;     // wanted free space around an accent, font units

// Points along an outline (absolute path from HarfBuzz: M L Q C Z), every ~30 units,
// so the middle of a long stroke counts as much as its ends.
export function samplePath(d, dx, dy) {
  const out = [];
  const re = /([MLQCZ])([^MLQCZ]*)/g;
  let m, cx = 0, cy = 0, sx = 0, sy = 0;
  const add = (x, y) => out.push([x + dx, y + dy]);
  const seg = (n, f) => { for (let i = 1; i <= n; i++) add(...f(i / n)); };
  while ((m = re.exec(d))) {
    const v = (m[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (m[1] === 'M') { cx = sx = v[0]; cy = sy = v[1]; add(cx, cy); }
    else if (m[1] === 'L') {
      const [x, y] = v, n = Math.max(1, Math.ceil(Math.hypot(x - cx, y - cy) / 30)), x0 = cx, y0 = cy;
      seg(n, (t) => [x0 + (x - x0) * t, y0 + (y - y0) * t]); cx = x; cy = y;
    } else if (m[1] === 'Q') {
      const [qx, qy, x, y] = v, x0 = cx, y0 = cy;
      seg(8, (t) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * qx + t * t * x, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * qy + t * t * y]); cx = x; cy = y;
    } else if (m[1] === 'C') {
      const [ax, ay, bx, by, x, y] = v, x0 = cx, y0 = cy;
      seg(10, (t) => {
        const u = 1 - t;
        return [u ** 3 * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t ** 3 * x, u ** 3 * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t ** 3 * y];
      }); cx = x; cy = y;
    } else if (m[1] === 'Z') { cx = sx; cy = sy; }
  }
  return out;
}

// Distance from a box to the nearest point (0 if inside).
function clearance(box, pts) {
  let best = Infinity;
  for (const [x, y] of pts) {
    const ddx = Math.max(box.x0 - x, 0, x - box.x1), ddy = Math.max(box.y0 - y, 0, y - box.y1);
    const d = Math.hypot(ddx, ddy);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Returns shapeText(text) -> {glyphs, box} for a loaded HarfBuzz font.
 *
 * Open vowels (house rule) arrive as vowel + U+0300. We do not let the font place that
 * accent: as a combining mark it can break the cursive join (after è followed by i the
 * font even inserts a dotted circle), and it puts it inside the circle of ò, where it
 * reads as the dot of ou. Instead the accent is taken out before shaping; the vowel it
 * belonged to is found again through HarfBuzz clusters and flagged `open` (drawn in the
 * accent colour), and the accent itself is added last, like a dot over an i: above its
 * vowel at the first free spot (above, above-right, above-left, then higher), clear of
 * the word's strokes and of other accents, never beside or below the vowel.
 */
export function makeShaper(hb, font) {
  const accentGid = typeof font.nominalGlyph === 'function' ? font.nominalGlyph(0x300) : null;
  const paths = new Map(); // glyph id -> outline (most glyphs are invisible joiners)
  const pathOf = (gid) => {
    let p = paths.get(gid);
    if (p === undefined) { p = font.glyphToPath(gid); paths.set(gid, p ? tidy(p) : ''); p = paths.get(gid); }
    return p;
  };
  const accentPath = accentGid != null ? pathOf(accentGid) : '';
  const accentBox = accentPath ? pathBox(accentPath) : null;

  return function shapeText(text) {
    // take the accents out, remembering which characters (by UTF-16 offset) carried one
    let clean = '', last = -1;
    const open = new Set();
    for (const ch of text) {
      if (ch === '\u0300') { if (last >= 0) open.add(last); continue; }
      last = clean.length;
      clean += ch;
    }
    const buffer = new hb.Buffer();
    buffer.addText(clean);
    buffer.guessSegmentProperties();
    hb.shape(font, buffer);
    const out = [];
    const vowelBox = new Map(); // cluster -> box of the open vowel's glyphs
    const glyphClusters = [];   // {cluster, entry} for every visible glyph
    let px = 0, py = 0;
    for (const g of buffer.getGlyphInfosAndPositions()) {
      const d = pathOf(g.codepoint);
      if (d) {
        const x = px + (g.xOffset || 0), y = py + (g.yOffset || 0);
        const b = pathBox(d);
        if (b) {
          const entry = { d, x, y, box: b, len: Math.hypot(b.x1 - b.x0, b.y1 - b.y0) };
          if (open.has(g.cluster)) {
            entry.open = true;
            const B = { x0: b.x0 + x, y0: b.y0 + y, x1: b.x1 + x, y1: b.y1 + y }, A = vowelBox.get(g.cluster);
            vowelBox.set(g.cluster, A ? { x0: Math.min(A.x0, B.x0), y0: Math.min(A.y0, B.y0), x1: Math.max(A.x1, B.x1), y1: Math.max(A.y1, B.y1) } : B);
          }
          out.push(entry);
          glyphClusters.push({ cluster: g.cluster, entry });
        }
      }
      px += g.xAdvance || 0;
      py += g.yAdvance || 0;
    }
    buffer.destroy?.();

    // The font may merge an open vowel into the glyph of the letter before it (i + è
    // in "hier" becomes one compound sign): then that cluster stands for the vowel.
    for (const idx of open) {
      if (vowelBox.has(idx)) continue;
      let host = -1;
      for (const g of glyphClusters) if (g.cluster <= idx && g.cluster > host) host = g.cluster;
      if (host < 0) continue;
      for (const g of glyphClusters) {
        if (g.cluster !== host) continue;
        g.entry.open = true;
        const e = g.entry, B = { x0: e.box.x0 + e.x, y0: e.box.y0 + e.y, x1: e.box.x1 + e.x, y1: e.box.y1 + e.y }, A = vowelBox.get(idx);
        vowelBox.set(idx, A ? { x0: Math.min(A.x0, B.x0), y0: Math.min(A.y0, B.y0), x1: Math.max(A.x1, B.x1), y1: Math.max(A.y1, B.y1) } : B);
      }
    }

    // add the accents, in reading order, each above its vowel
    if (accentBox && vowelBox.size) {
      const obstacles = out.flatMap((g) => samplePath(g.d, g.x, g.y));
      const b = accentBox, w = b.x1 - b.x0, h = b.y1 - b.y0;
      for (const cluster of [...vowelBox.keys()].sort((p, q) => p - q)) {
        const B = vowelBox.get(cluster), cx = (B.x0 + B.x1) / 2;
        const up = (k) => B.y1 + k * GAP + h / 2;
        const cands = [
          [cx, up(1)], [B.x1 + w / 2, up(0.6)], [B.x0 - w / 2, up(0.6)],
          [cx + w, up(1)], [cx - w, up(1)],
          [cx, up(2)], [B.x1 + w / 2, up(1.6)], [B.x0 - w / 2, up(1.6)], [cx, up(3)],
        ];
        let pick = null, bestClear = -1;
        for (const [ax, ay] of cands) {
          const c = clearance({ x0: ax - w / 2, y0: ay - h / 2, x1: ax + w / 2, y1: ay + h / 2 }, obstacles);
          if (c >= CLEAR) { pick = [ax, ay]; break; }
          if (c > bestClear) { bestClear = c; pick = [ax, ay]; }
        }
        const x = pick[0] - (b.x0 + b.x1) / 2, y = pick[1] - (b.y0 + b.y1) / 2;
        out.push({ d: accentPath, x, y, box: b, len: Math.hypot(w, h), mark: true });
        obstacles.push(...samplePath(accentPath, x, y)); // later accents keep clear of this one
      }
    }

    let X0 = 0, Y0 = 0, X1 = 0, Y1 = 0;
    out.forEach((g, i) => {
      const x0 = g.box.x0 + g.x, y0 = g.box.y0 + g.y, x1 = g.box.x1 + g.x, y1 = g.box.y1 + g.y;
      if (i === 0) { X0 = x0; Y0 = y0; X1 = x1; Y1 = y1; }
      else { X0 = Math.min(X0, x0); Y0 = Math.min(Y0, y0); X1 = Math.max(X1, x1); Y1 = Math.max(Y1, y1); }
    });
    return { glyphs: out, box: { x0: Math.min(X0, 0), y0: Math.min(Y0, 0), x1: Math.max(X1, 0), y1: Math.max(Y1, 0) } };
  };
}
