// A sheet of shorthand: turns text into laid-out words, draws them as SVG
// glyph outlines and inks new words stroke by stroke. Used by the canvas
// (index.html) and by every live cell of the lessons (learn.html).
import { shape } from './shaper.js';
import { parsePhonemes } from './systems.js';

const NS = 'http://www.w3.org/2000/svg';
const WORD_GAP = 30, SEP_GAP = 22, LINE_GAP = 44, GLOSS_GAP = 20;
const MASK_W = 210; // reveal brush width, font units (wider than the pen stroke)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text !== undefined) n.textContent = text;
  return n;
};

/**
 * Text -> word items, merging elided letters with the word they join.
 * @param overrides map of lowercased word -> "P o" (the learner's own sounds)
 */
export function buildItems(text, sys, { useSigles = true, overrides = {} } = {}) {
  const items = [];
  const withOverride = (raw) => {
    const k = raw.text.toLowerCase();
    if (!raw.sigle && !raw.elided && !raw.number && overrides[k] !== undefined) {
      return { ...raw, tokens: parsePhonemes(overrides[k], sys).tokens, edited: true, guessed: false };
    }
    return raw;
  };
  sys.transcribe(text, { useSigles }).forEach((sent, si) => {
    if (si) items.push({ kind: 'sep', text: '×' });
    let pending = null;
    for (const raw of sent.map(withOverride)) {
      if (raw.number) { if (pending) { items.push(pending); pending = null; } items.push({ kind: 'num', text: raw.text }); continue; }
      const g = pending ?? { kind: 'word', parts: [], text: '', tokens: [], proper: false, edited: false };
      g.parts.push(raw);
      g.text += raw.text;
      g.tokens = g.tokens.concat(raw.tokens);
      g.proper ||= !!raw.properNoun;
      g.edited ||= !!raw.edited;
      g.guessed ||= !!raw.guessed;
      g.sigle ||= !!raw.sigle;
      if (raw.joinToNext) pending = g; else { items.push(g); pending = null; }
    }
    if (pending) items.push(pending);
  });
  keyItems(items);
  return items;
}

// Stable keys: same word with same sounds keeps its node (and is not re-inked).
export function keyItems(items) {
  const seen = new Map(), seenText = new Map();
  for (const it of items) {
    const base = it.kind === 'word' ? `${it.text.toLowerCase()}|${it.tokens.join('.')}` : `${it.kind}|${it.text}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    it.key = `${base}|${n}`;
    if (it.kind === 'word') {
      const t = it.text.toLowerCase();
      it.occ = (seenText.get(t) || 0) + 1;
      seenText.set(t, it.occ);
    }
  }
  return items;
}

const mctx = document.createElement('canvas').getContext('2d');
const textW = (s, font) => { mctx.font = font; return mctx.measureText(s).width; };

export class InkSheet {
  /**
   * @param {SVGSVGElement|SVGGElement} root where word groups are appended
   * @param {{unit?:number, width:()=>number, gloss:()=>boolean, interactive?:boolean, maxInkMs?:number, glossOf?:(it)=>string}} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.unit = opts.unit ?? 0.056;
    this.opts = opts;
    this.nodes = new Map();
    this.items = [];
    this.size = { w: 0, h: 0 };
    this.running = new Set();
  }

  static seq = 0;

  measure(it, sys) {
    const U = this.unit;
    if (it.kind === 'sep') return { w: 12, asc: 8, desc: 4, left: 0 };
    if (it.kind === 'num') return { w: textW(it.text, '500 22px "Geist Mono", monospace'), asc: 18, desc: 6, left: 0 };
    it.shape = shape(sys.toDuployan(it.tokens));
    const b = it.shape.box;
    const inkW = (b.x1 - b.x0) * U;
    const glossW = this.opts.gloss() ? textW(this.glossText(it), '12px "Geist Mono", monospace') : 0;
    return { w: Math.max(inkW, glossW, 8), inkW, asc: Math.max(b.y1 * U, 10), desc: Math.max(-b.y0 * U, 6), left: -b.x0 * U };
  }

  glossText(it) { return this.opts.glossOf ? this.opts.glossOf(it) : it.text; }

  layout(items, sys) {
    const W = this.opts.width();
    const gloss = this.opts.gloss();
    const lines = [];
    let line = [], x = 0, maxX = 0;
    for (const it of items) {
      it.m = this.measure(it, sys);
      if (line.length && it.kind !== 'sep' && x + it.m.w > W) { lines.push(line); line = []; x = 0; }
      it.lx = x;
      line.push(it);
      maxX = Math.max(maxX, x + it.m.w);
      x += it.m.w + (it.kind === 'sep' ? SEP_GAP : WORD_GAP);
    }
    if (line.length) lines.push(line);
    let top = 0;
    for (const ln of lines) {
      const asc = Math.max(...ln.map((i) => i.m.asc)), desc = Math.max(...ln.map((i) => i.m.desc));
      const base = top + asc; // the pen starts on the writing line
      for (const it of ln) { it.x = it.lx + it.m.left; it.y = base; it.glossY = desc + GLOSS_GAP; it.lineDesc = desc; }
      top = base + desc + (gloss ? GLOSS_GAP + 4 : 0) + LINE_GAP;
    }
    return { w: W, used: maxX, h: Math.max(top - LINE_GAP, 40) };
  }

  fill(g, it) {
    const U = this.unit, m = it.m, gloss = this.opts.gloss();
    g.replaceChildren();
    if (it.kind === 'sep') { g.append(el('text', { class: 'sepmark', x: 0, y: 4, 'text-anchor': 'middle' }, '×')); return; }
    if (it.kind === 'num') {
      g.append(el('text', { class: 'num', x: 0, y: 0 }, it.text), el('line', { class: 'ul', x1: 0, x2: m.w, y1: 6, y2: 6 }));
      return;
    }
    const bottom = gloss ? it.glossY + 6 : it.lineDesc;
    g.append(el('rect', { class: 'hit', x: -m.left - 8, y: -m.asc - 8, width: m.w + 16, height: m.asc + bottom + 14, rx: 9 }));
    const glyphs = el('g', { transform: `scale(${U},${-U})` });
    for (const gl of it.shape.glyphs) glyphs.append(el('path', { class: 'g', d: gl.d, transform: `translate(${gl.x},${gl.y})` }));
    g.append(glyphs);
    if (it.proper) g.append(el('line', { class: 'ul', x1: -m.left, x2: -m.left + m.inkW, y1: m.desc + 5, y2: m.desc + 5 }));
    if (gloss) g.append(el('text', { class: 'gloss', x: -m.left, y: it.glossY }, this.glossText(it)));
    g.setAttribute('aria-label', `${it.text}: ${it.tokens.join(' ')}`);
  }

  make(it) {
    const g = el('g', { class: `word fresh${it.kind !== 'word' ? ' deco' : ''}`, 'data-key': it.key });
    if (it.kind === 'word' && this.opts.interactive) { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); }
    else g.style.cursor = 'default';
    this.fill(g, it);
    return g;
  }

  /** Lay out and draw items. Words whose key is new are inked; the rest glide into place. */
  set(items, sys, { inkAll = false, ink = true } = {}) {
    if (inkAll) this.stop();
    this.size = this.layout(items, sys);
    const old = this.nodes, next = new Map(), queue = [];
    for (const it of items) {
      let g = old.get(it.key);
      if (g && !inkAll) {
        old.delete(it.key);
        this.fill(g, it);
      } else {
        if (g) { old.delete(it.key); g.remove(); }
        g = this.make(it);
        this.root.append(g);
        if (it.kind === 'word') queue.push([g, it]);
      }
      g.style.transform = `translate(${it.x.toFixed(2)}px, ${it.y.toFixed(2)}px)`;
      it.node = g;
      next.set(it.key, g);
    }
    for (const g of old.values()) { g.classList.add('leaving'); setTimeout(() => g.remove(), 220); }
    this.nodes = next;
    this.items = items;
    if (ink) this.ink(queue);
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const g of this.nodes.values()) g.classList.remove('fresh'); }));
    return this.size;
  }

  /** Re-ink every word from scratch. */
  replay() {
    this.stop();
    this.ink(this.items.filter((i) => i.kind === 'word').map((i) => [i.node, i]));
  }

  stop() {
    for (const r of this.running) { r.anim.cancel(); r.path.removeAttribute('mask'); r.mask.remove(); }
    this.running.clear();
  }

  // Each glyph is revealed by a wide white stroke running along its own outline
  // inside a mask. Outlines start at the pen's entry point, so the reveal follows
  // the direction of writing. Masks are removed as soon as a glyph is finished.
  ink(queue) {
    if (reduceMotion.matches || !queue.length) return;
    const plan = [];
    let total = 0;
    for (const [g, it] of queue) {
      const paths = g.querySelectorAll('.g');
      it.shape.glyphs.forEach((gl, i) => {
        const dur = clamp(90 + gl.len * 0.17, 120, 340);
        plan.push({ g, gl, path: paths[i], dur });
        total += dur * 0.85;
      });
      total += 70; // pen lift between words
    }
    const speed = Math.min(1, (this.opts.maxInkMs ?? 5000) / Math.max(total, 1));
    let t = 40, lastG = null;
    for (const p of plan) {
      if (lastG && lastG !== p.g) t += 70 * speed;
      lastG = p.g;
      const { gl, path } = p;
      if (!path) continue;
      const id = `ink${++InkSheet.seq}`;
      const pad = MASK_W;
      const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: gl.box.x0 - pad, y: gl.box.y0 - pad, width: gl.box.x1 - gl.box.x0 + 2 * pad, height: gl.box.y1 - gl.box.y0 + 2 * pad });
      const brush = el('path', { d: gl.d, fill: 'none', stroke: '#fff', 'stroke-width': MASK_W, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 });
      mask.append(brush);
      path.parentNode.insertBefore(mask, path);
      path.setAttribute('mask', `url(#${id})`);
      const dur = p.dur * speed;
      // The outline runs out along one side of the stroke and back along the other;
      // the wide brush covers the whole stroke on the way out, so half the contour suffices.
      const anim = brush.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0.5 }], { duration: dur, delay: t, easing: 'cubic-bezier(.35,.1,.25,1)', fill: 'both' });
      const rec = { anim, path, mask };
      this.running.add(rec);
      anim.finished.then(() => { path.removeAttribute('mask'); mask.remove(); this.running.delete(rec); }, () => {});
      t += dur * 0.85;
    }
  }
}

/** One sign drawn alone at a shared scale (so short and long strokes keep their proportions). */
const signCache = new Map();
export function signSvg(sys, token, span = 1250) {
  const ck = `${sys.id}:${token}:${span}`;
  if (signCache.has(ck)) return signCache.get(ck);
  const s = shape(sys.toDuployan([token]));
  const b = s.box;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const paths = s.glyphs.map((g) => `<path d="${g.d}" transform="translate(${g.x},${g.y})"/>`).join('');
  const svg = `<svg class="glyph" viewBox="${cx - span / 2} ${-cy - span / 2} ${span} ${span}" aria-hidden="true"><g transform="scale(1,-1)">${paths}</g></svg>`;
  signCache.set(ck, svg);
  return svg;
}
