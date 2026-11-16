import { transcribe, toDuployan, parsePhonemes } from './duploye.js';
import { wordToPhonemes } from './g2p.js';
import { loadFont, shape } from './shaper.js';

// ---------- constants ----------
const NS = 'http://www.w3.org/2000/svg';
const UNIT = 0.056;            // world px per font unit (56 px per em at 100 %)
const pageWidth = () => (innerWidth < 640 ? 540 : 960); // writing width, world px (narrower on phones = larger text)
const WORD_GAP = 30, SEP_GAP = 22, LINE_GAP = 44, GLOSS_GAP = 20;
const GRID = 24;               // dot spacing at 100 %
const MASK_W = 210;            // reveal brush width, font units (> stroke weight)
const SAMPLE = "La loi donne à l'avocat l'arme qu'il faut pour chaque cas. Lorsque la cause est bonne et en accord avec le code, il l'adopte et la gagne.";
const GROUPS = [
  ['Lines', ['P', 'B', 'T', 'D', 'F', 'V', 'K', 'G', 'L', 'R']],
  ['Half circles', ['M', 'N', 'GN', 'S', 'Z', 'J', 'CH']],
  ['Vowels', ['a', 'o', 'ou', 'é', 'i', 'u', 'eu']],
  ['Nasals', ['an', 'in', 'on', 'un']],
];
const HINT = { a: 'a', o: 'o au eau', ou: 'ou', 'é': 'é è ai', i: 'i y', u: 'u', eu: 'eu œ', an: 'an en', in: 'in ain', on: 'on', un: 'un',
  K: 'c qu', S: 's ç', Z: 'z', J: 'j ge', CH: 'ch', GN: 'gn', R: 'r', L: 'l' };

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text !== undefined) n.textContent = text;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- state ----------
const state = {
  text: store.get('duploye.v2.text', SAMPLE),
  overrides: store.get('duploye.overrides', {}),
  gloss: store.get('duploye.gloss', true),
  sigles: store.get('duploye.sigles', true),
  sel: null,                    // { text: lowercased, n: occurrence }
};
const view = { x: 0, y: 0, k: 1 };
let model = [];                 // laid-out items
let nodes = new Map();          // key -> <g>
let content = { w: 960, h: 100 };

const stage = $('stage'), world = $('world'), ink = $('ink');

// ---------- model ----------
function withOverride(raw) {
  const k = raw.text.toLowerCase();
  if (!raw.sigle && !raw.elided && !raw.number && state.overrides[k] !== undefined) {
    return { ...raw, tokens: parsePhonemes(state.overrides[k]).tokens, edited: true };
  }
  return raw;
}

function buildItems() {
  const items = [];
  transcribe(state.text, { useSigles: state.sigles }).forEach((sent, si) => {
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
      if (raw.joinToNext) pending = g; else { items.push(g); pending = null; }
    }
    if (pending) items.push(pending);
  });
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

// ---------- measuring & layout ----------
const mctx = document.createElement('canvas').getContext('2d');
const textW = (s, font) => { mctx.font = font; return mctx.measureText(s).width; };

function measure(it) {
  if (it.kind === 'sep') return { w: 12, asc: 8, desc: 4, left: 0 };
  if (it.kind === 'num') return { w: textW(it.text, '500 22px "Geist Mono", monospace'), asc: 18, desc: 6, left: 0 };
  it.shape = shape(toDuployan(it.tokens));
  const b = it.shape.box;
  const inkW = (b.x1 - b.x0) * UNIT;
  const glossW = state.gloss ? textW(it.text, '12px "Geist Mono", monospace') : 0;
  return { w: Math.max(inkW, glossW, 8), inkW, asc: Math.max(b.y1 * UNIT, 10), desc: Math.max(-b.y0 * UNIT, 6), left: -b.x0 * UNIT };
}

function layout(items) {
  const PAGE_W = pageWidth();
  const lines = [];
  let line = [], x = 0;
  for (const it of items) {
    it.m = measure(it);
    if (line.length && it.kind !== 'sep' && x + it.m.w > PAGE_W) { lines.push(line); line = []; x = 0; }
    it.lx = x;
    line.push(it);
    x += it.m.w + (it.kind === 'sep' ? SEP_GAP : WORD_GAP);
  }
  if (line.length) lines.push(line);
  let top = 0;
  for (const ln of lines) {
    const asc = Math.max(...ln.map((i) => i.m.asc)), desc = Math.max(...ln.map((i) => i.m.desc));
    const base = top + asc;   // the pen starts on the writing line
    for (const it of ln) { it.x = it.lx + it.m.left; it.y = base; it.glossY = desc + GLOSS_GAP; it.lineDesc = desc; }
    top = base + desc + (state.gloss ? GLOSS_GAP + 4 : 0) + LINE_GAP;
  }
  return { w: PAGE_W, h: Math.max(top - LINE_GAP, 60) };
}

// ---------- drawing ----------
function fillNode(g, it) {
  g.replaceChildren();
  const m = it.m;
  if (it.kind === 'sep') { g.append(el('text', { class: 'sepmark', x: 0, y: 4, 'text-anchor': 'middle' }, '×')); return; }
  if (it.kind === 'num') {
    g.append(el('text', { class: 'num', x: 0, y: 0 }, it.text), el('line', { class: 'ul', x1: 0, x2: m.w, y1: 6, y2: 6 }));
    return;
  }
  const bottom = state.gloss ? it.glossY + 6 : it.lineDesc;
  g.append(el('rect', { class: 'hit', x: -m.left - 8, y: -m.asc - 8, width: m.w + 16, height: m.asc + bottom + 14, rx: 9 }));
  const glyphs = el('g', { transform: `scale(${UNIT},${-UNIT})` });
  for (const gl of it.shape.glyphs) glyphs.append(el('path', { class: 'g', d: gl.d, transform: `translate(${gl.x},${gl.y})` }));
  g.append(glyphs);
  if (it.proper) g.append(el('line', { class: 'ul', x1: -m.left, x2: -m.left + m.inkW, y1: m.desc + 5, y2: m.desc + 5 }));
  if (state.gloss) g.append(el('text', { class: 'gloss', x: -m.left, y: it.glossY }, it.text));
  g.setAttribute('aria-label', `${it.text}: ${it.tokens.join(' ')}`);
}

function makeNode(it) {
  const g = el('g', { class: `word fresh${it.kind !== 'word' ? ' deco' : ''}`, 'data-key': it.key });
  if (it.kind === 'word') { g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); }
  else g.style.cursor = 'default';
  fillNode(g, it);
  return g;
}

const place = (g, it) => { g.style.transform = `translate(${it.x.toFixed(2)}px, ${it.y.toFixed(2)}px)`; };

// ---------- ink animation ----------
// Each glyph is revealed by a wide white stroke running along its own outline
// inside a mask. Outlines start at the pen's entry point, so the reveal follows
// the direction of writing. Masks are removed as soon as a glyph is finished.
const running = new Set();
let maskSeq = 0;

function stopInk() {
  for (const r of running) { r.anim.cancel(); r.path.removeAttribute('mask'); r.mask.remove(); }
  running.clear();
}

function inkWords(queue) {
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
  const speed = Math.min(1, 5000 / Math.max(total, 1)); // keep a long page under ~5 s
  let t = 40, lastG = null;
  for (const p of plan) {
    if (lastG && lastG !== p.g) t += 70 * speed;
    lastG = p.g;
    const { gl, path } = p;
    const id = `ink${++maskSeq}`;
    const pad = MASK_W;
    const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: gl.box.x0 - pad, y: gl.box.y0 - pad, width: gl.box.x1 - gl.box.x0 + 2 * pad, height: gl.box.y1 - gl.box.y0 + 2 * pad });
    const brush = el('path', { d: gl.d, fill: 'none', stroke: '#fff', 'stroke-width': MASK_W, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 });
    mask.append(brush);
    path.parentNode.insertBefore(mask, path);
    path.setAttribute('mask', `url(#${id})`);
    const dur = p.dur * speed;
    // The outline runs out along one side of the stroke and back along the other;
    // the wide brush covers the full stroke on the way out, so half the contour suffices.
    const anim = brush.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0.5 }], { duration: dur, delay: t, easing: 'cubic-bezier(.35,.1,.25,1)', fill: 'both' });
    const rec = { anim, path, mask };
    running.add(rec);
    anim.finished.then(() => { path.removeAttribute('mask'); mask.remove(); running.delete(rec); }, () => {});
    t += dur * 0.85;
  }
}

// ---------- update cycle ----------
function update({ inkAll = false } = {}) {
  if (inkAll) stopInk();
  const items = buildItems();
  content = layout(items);
  const old = nodes;
  const next = new Map();
  const queue = [];
  for (const it of items) {
    let g = old.get(it.key);
    if (g && !inkAll) {
      old.delete(it.key);
      fillNode(g, it);
    } else {
      if (g) { old.delete(it.key); g.remove(); }
      g = makeNode(it);
      ink.append(g);
      if (it.kind === 'word') queue.push([g, it]);
    }
    place(g, it);
    it.node = g;
    next.set(it.key, g);
  }
  for (const g of old.values()) { g.classList.add('leaving'); setTimeout(() => g.remove(), 220); }
  nodes = next;
  model = items;
  inkWords(queue);
  requestAnimationFrame(() => requestAnimationFrame(() => { for (const g of nodes.values()) g.classList.remove('fresh'); }));
  syncSelection();
  const words = items.filter((i) => i.kind === 'word');
  const edited = words.filter((w) => w.edited).length;
  $('status').textContent = `${words.length} word${words.length === 1 ? '' : 's'}${edited ? ` · ${edited} edited` : ''}`;
}

// ---------- view: pan & zoom ----------
let rafView = 0;
function applyView() {
  rafView = 0;
  world.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})`;
  let s = GRID * view.k;
  while (s < 14) s *= 2; // keep the dot grid calm when zoomed out
  stage.style.backgroundSize = `${s}px ${s}px`;
  stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
  $('zoomPct').textContent = `${Math.round(view.k * 100)}%`;
  positionInspector();
}
const scheduleView = () => { if (!rafView) rafView = requestAnimationFrame(applyView); };

function zoomAt(factor, cx, cy) {
  const k = clamp(view.k * factor, 0.2, 5);
  const r = k / view.k;
  view.x = cx - (cx - view.x) * r;
  view.y = cy - (cy - view.y) * r;
  view.k = k;
  scheduleView();
}

let tween = 0;
function animateView(to, ms = 420) {
  cancelAnimationFrame(tween);
  if (reduceMotion.matches) { Object.assign(view, to); scheduleView(); return; }
  const from = { ...view }, t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms), e = ease(t);
    view.x = from.x + (to.x - from.x) * e;
    view.y = from.y + (to.y - from.y) * e;
    view.k = from.k + (to.k - from.k) * e;
    applyView();
    if (t < 1) tween = requestAnimationFrame(step);
  };
  tween = requestAnimationFrame(step);
}

function safeArea() {
  const top = $('bar').getBoundingClientRect().bottom + 20;
  const bottom = $('composer').getBoundingClientRect().top - 20;
  const side = innerWidth < 640 ? 16 : 40;
  const d = $('drawer');
  const right = !d.hidden && innerWidth > 640 ? d.getBoundingClientRect().left - 24 : innerWidth - side;
  return { left: side, right, top, bottom };
}
function fitTarget() {
  const a = safeArea();
  const aw = a.right - a.left, ah = Math.max(80, a.bottom - a.top);
  let k = clamp(Math.min(aw / content.w, 1.15), 0.25, 1.15);
  if (content.h * k > ah) k = clamp(Math.max(ah / content.h, Math.min(aw / content.w, 0.7)), 0.25, k);
  const x = a.left + (aw - content.w * k) / 2;
  const y = content.h * k <= ah ? a.top + (ah - content.h * k) / 2 : a.top;
  return { x, y, k };
}
const fit = (animate = true) => (animate ? animateView(fitTarget()) : (Object.assign(view, fitTarget()), applyView()));

// pointer: drag to pan (anywhere), tap a word to select it, pinch to zoom
const pointers = new Map();
let gesture = null;
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  cancelAnimationFrame(tween);
  if (pointers.size === 1) gesture = { moved: false, sx: e.clientX, sy: e.clientY, target: e.target.closest?.('.word:not(.deco)') };
  else if (pointers.size === 2) gesture = { pinch: pinchInfo(), moved: true };
});
stage.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p || !gesture) return;
  if (gesture.pinch && pointers.size === 2) {
    p.x = e.clientX; p.y = e.clientY;
    const now = pinchInfo(), was = gesture.pinch;
    view.x += now.cx - was.cx; view.y += now.cy - was.cy;
    zoomAt(now.d / was.d, now.cx, now.cy);
    gesture.pinch = now;
    return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (!gesture.moved && Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 4) { gesture.moved = true; stage.classList.add('panning'); }
  if (gesture.moved) { view.x += dx; view.y += dy; scheduleView(); }
});
const endPointer = (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    if (gesture && !gesture.moved && e.type === 'pointerup') {
      if (gesture.target) select(itemOfNode(gesture.target)); else select(null);
    }
    gesture = null;
    stage.classList.remove('panning');
  } else if (pointers.size === 1 && gesture?.pinch) {
    const [id, p] = [...pointers][0];
    gesture = { moved: true, sx: p.x, sy: p.y, id };
  }
};
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
function pinchInfo() {
  const [a, b] = [...pointers.values()];
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
}
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  cancelAnimationFrame(tween);
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.008)), e.clientX, e.clientY);
  else { view.x -= e.deltaX; view.y -= e.deltaY; scheduleView(); }
}, { passive: false });
ink.addEventListener('keydown', (e) => {
  const w = e.target.closest?.('.word:not(.deco)');
  if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(itemOfNode(w)); }
});

// ---------- selection & inspector ----------
const itemOfNode = (g) => model.find((i) => i.node === g) || null;
const selectedItem = () => (state.sel ? model.find((i) => i.kind === 'word' && i.text.toLowerCase() === state.sel.text && i.occ === state.sel.n) : null);
const editablePart = (it) => it?.parts.find((p) => !p.elided && !p.sigle) || null;

function select(it) {
  state.sel = it && it.kind === 'word' ? { text: it.text.toLowerCase(), n: it.occ } : null;
  $('palette').hidden = true;
  $('inspAdd').setAttribute('aria-expanded', 'false');
  syncSelection(true);
}

function syncSelection(opening = false) {
  const it = selectedItem();
  for (const g of nodes.values()) g.classList.toggle('sel', !!it && g === it.node);
  const insp = $('inspector');
  if (!it) { insp.hidden = true; state.sel = null; $('drawerHint').textContent = 'Select a word, then tap a sign to add it.'; return; }
  $('drawerHint').textContent = `Tap a sign to add it to “${it.text}”.`;
  const part = editablePart(it);
  $('inspWord').textContent = it.text;
  $('inspNote').textContent = !part ? 'Abbreviation (sigle): a fixed sign.' : it.edited ? 'Sounds edited by you.' : 'Sounds guessed from spelling. Tap a sound to remove it.';
  $('inspReset').hidden = !it.edited;
  $('inspAdd').hidden = !part;
  const chips = [];
  for (const p of it.parts) {
    p.tokens.forEach((t, i) => {
      const editable = p === part;
      chips.push(`<button type="button" class="chip ${editable ? 'removable' : 'fixed'}" ${editable ? `data-rm="${i}" title="Remove ${esc(t)}"` : 'disabled'}>${glyphSvg(t)}<span>${esc(t)}</span></button>`);
    });
  }
  $('chips').innerHTML = chips.join('') || '<span class="insp-note">No sounds. Add one below.</span>';
  if (insp.hidden) {
    if (innerWidth <= 640 && !$('drawer').hidden) { $('drawer').hidden = true; setToggle('alpha', false); } // one sheet at a time
    insp.hidden = false;
    if (opening && !reduceMotion.matches) { insp.classList.add('enter'); requestAnimationFrame(() => requestAnimationFrame(() => insp.classList.remove('enter'))); }
  }
  positionInspector();
  if (opening) requestAnimationFrame(revealAboveSheet);
}

function syncDock() {
  document.documentElement.style.setProperty('--dock', `${$('composer').offsetHeight}px`);
}

// On phones the inspector is a sheet; slide the page so the chosen word stays above it.
function revealAboveSheet() {
  const it = selectedItem();
  const insp = $('inspector');
  if (!it?.node || insp.hidden || innerWidth > 640) return;
  const r = it.node.getBoundingClientRect();
  const limit = insp.getBoundingClientRect().top - 16;
  const topLimit = $('bar').getBoundingClientRect().bottom + 16;
  let dy = 0;
  if (r.bottom > limit) dy = limit - r.bottom;
  else if (r.top < topLimit) dy = topLimit - r.top;
  if (dy) animateView({ ...view, y: view.y + dy }, 320);
}

function positionInspector() {
  const insp = $('inspector');
  if (insp.hidden || innerWidth <= 640) return;
  const it = selectedItem();
  if (!it?.node?.isConnected) return;
  const r = it.node.getBoundingClientRect();
  const w = insp.offsetWidth, h = insp.offsetHeight;
  const limitBottom = $('composer').getBoundingClientRect().top - 12;
  let left = clamp(r.left, 12, innerWidth - w - 12);
  let top = r.bottom + 10;
  if (top + h > limitBottom) top = r.top - h - 10;
  top = clamp(top, $('bar').getBoundingClientRect().bottom + 10, limitBottom - h);
  insp.style.left = `${left}px`;
  insp.style.top = `${top}px`;
}

function editTokens(fn) {
  const it = selectedItem();
  const part = editablePart(it);
  if (!part) return;
  const tokens = fn([...part.tokens]);
  state.overrides[part.text.toLowerCase()] = tokens.join(' ');
  store.set('duploye.overrides', state.overrides);
  update();
}

$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rm]');
  if (b) editTokens((t) => { t.splice(+b.dataset.rm, 1); return t; });
});
$('inspAdd').addEventListener('click', () => {
  const p = $('palette');
  p.hidden = !p.hidden;
  $('inspAdd').setAttribute('aria-expanded', String(!p.hidden));
  if (!p.hidden && !p.childElementCount) {
    p.innerHTML = GROUPS.flatMap(([, ts]) => ts).map((t) => `<button type="button" class="chip" data-add="${esc(t)}" title="Add ${esc(t)}">${glyphSvg(t)}<span>${esc(t)}</span></button>`).join('');
  }
  positionInspector();
});
$('palette').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (b) { editTokens((t) => [...t, b.dataset.add]); popLast(); }
});
$('inspReset').addEventListener('click', () => {
  const part = editablePart(selectedItem());
  if (!part) return;
  delete state.overrides[part.text.toLowerCase()];
  store.set('duploye.overrides', state.overrides);
  update();
});
$('inspClose').addEventListener('click', () => select(null));
const popLast = () => { const c = $('chips').querySelectorAll('.chip'); c[c.length - 1]?.classList.add('pop'); };

// ---------- mini glyphs (chips, legend) ----------
const glyphCache = new Map();
function glyphSvg(token) {
  if (glyphCache.has(token)) return glyphCache.get(token);
  // One shared scale for every sign, so a short P stays half the length of a long B.
  const s = shape(toDuployan([token]));
  const b = s.box, span = 1250;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const paths = s.glyphs.map((g) => `<path d="${g.d}" transform="translate(${g.x},${g.y})"/>`).join('');
  const svg = `<svg class="glyph" viewBox="${cx - span / 2} ${-cy - span / 2} ${span} ${span}" aria-hidden="true"><g transform="scale(1,-1)">${paths}</g></svg>`;
  glyphCache.set(token, svg);
  return svg;
}

function buildLegend() {
  $('legend').innerHTML = GROUPS.map(([name, ts]) =>
    `<div class="grp">${name}</div>` + ts.map((t) => `<button type="button" class="chip" data-add="${esc(t)}" title="${esc(HINT[t] || t)}">${glyphSvg(t)}<span>${esc(t)}</span></button>`).join('')).join('');
}
$('legend').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (!b) return;
  if (!editablePart(selectedItem())) { toast('Select a word on the page first.'); return; }
  editTokens((t) => [...t, b.dataset.add]);
  popLast();
});

// ---------- tools ----------
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 1800);
}
function setToggle(id, on) { $(id).setAttribute('aria-pressed', String(on)); }

$('replay').addEventListener('click', () => update({ inkAll: true }));
$('zoomIn').addEventListener('click', () => { const v = { ...view }; const k = clamp(v.k * 1.25, 0.2, 5), cx = innerWidth / 2, cy = innerHeight / 2; animateView({ k, x: cx - (cx - v.x) * k / v.k, y: cy - (cy - v.y) * k / v.k }, 260); });
$('zoomOut').addEventListener('click', () => { const v = { ...view }; const k = clamp(v.k / 1.25, 0.2, 5), cx = innerWidth / 2, cy = innerHeight / 2; animateView({ k, x: cx - (cx - v.x) * k / v.k, y: cy - (cy - v.y) * k / v.k }, 260); });
$('zoomPct').addEventListener('click', () => fit());
$('gloss').addEventListener('click', () => { state.gloss = !state.gloss; store.set('duploye.gloss', state.gloss); setToggle('gloss', state.gloss); update(); });
$('sigles').addEventListener('click', () => { state.sigles = !state.sigles; store.set('duploye.sigles', state.sigles); setToggle('sigles', state.sigles); update(); });
$('alpha').addEventListener('click', () => {
  const d = $('drawer');
  d.hidden = !d.hidden;
  setToggle('alpha', !d.hidden);
  if (!d.hidden && innerWidth <= 640) select(null); // one sheet at a time on phones
  if (innerWidth > 640) fit(); // make room beside the drawer, or take the room back
});
$('copy').addEventListener('click', async () => {
  const text = model.map((i) => (i.kind === 'word' ? toDuployan(i.tokens) : i.kind === 'sep' ? '×' : i.text)).join(' ');
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it where a Duployan font is installed.'); }
  catch { toast('Copy was blocked by the browser.'); }
});
$('export').addEventListener('click', () => {
  const pad = 32;
  const inkColor = '#1b2440', muted = '#7b8193';
  const body = model.map((it) => {
    const tr = `translate(${it.x.toFixed(2)},${it.y.toFixed(2)})`;
    if (it.kind === 'sep') return `<text transform="${tr}" y="4" text-anchor="middle" font-family="sans-serif" font-size="18" fill="${muted}">×</text>`;
    if (it.kind === 'num') return `<g transform="${tr}"><text font-family="monospace" font-size="22" fill="${inkColor}">${esc(it.text)}</text><line x2="${it.m.w}" y1="6" y2="6" stroke="${inkColor}"/></g>`;
    const paths = it.shape.glyphs.map((g) => `<path d="${g.d}" transform="translate(${g.x},${g.y})"/>`).join('');
    const ul = it.proper ? `<line x1="${-it.m.left}" x2="${-it.m.left + it.m.inkW}" y1="${it.m.desc + 5}" y2="${it.m.desc + 5}" stroke="${inkColor}" stroke-width="1.4"/>` : '';
    const gl = state.gloss ? `<text x="${-it.m.left}" y="${it.glossY}" font-family="monospace" font-size="12" fill="${muted}">${esc(it.text)}</text>` : '';
    return `<g transform="${tr}"><g transform="scale(${UNIT},${-UNIT})" fill="${inkColor}">${paths}</g>${ul}${gl}</g>`;
  }).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${content.w + 2 * pad} ${content.h + 2 * pad}" width="${content.w + 2 * pad}" height="${content.h + 2 * pad}">\n<rect x="${-pad}" y="${-pad}" width="100%" height="100%" fill="#fff"/>\n${body}\n</svg>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  a.download = 'duploye.svg';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Saved duploye.svg');
});

// composer
const src = $('src');
const autosize = () => { src.style.height = 'auto'; src.style.height = `${src.scrollHeight}px`; syncDock(); };
let typing = 0;
src.addEventListener('input', () => {
  autosize();
  clearTimeout(typing);
  typing = setTimeout(() => {
    state.text = src.value;
    store.set('duploye.v2.text', state.text);
    update();
  }, 160);
});
src.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); update({ inkAll: true }); }
});
$('composer').addEventListener('submit', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (e.target.closest('textarea, input') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'Escape') { if (!$('palette').hidden) { $('palette').hidden = true; positionInspector(); } else select(null); }
  else if (k === 'r' || k === 'R') update({ inkAll: true });
  else if (k === '0') fit();
  else if (k === '+' || k === '=') $('zoomIn').click();
  else if (k === '-') $('zoomOut').click();
  else if (k === 'g' || k === 'G') $('gloss').click();
  else if (k === 'a' || k === 'A') $('alpha').click();
  else return;
  e.preventDefault();
});
let resizeT = 0;
let lastPageW = pageWidth();
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (pageWidth() !== lastPageW) { lastPageW = pageWidth(); update(); }
    syncDock();
    fit(false);
  }, 120);
});

// ---------- boot ----------
async function boot() {
  src.value = state.text;
  autosize();
  setToggle('gloss', state.gloss);
  setToggle('sigles', state.sigles);
  $('status').textContent = 'Loading the pen…';
  try {
    await Promise.all([loadFont('fonts/NotoSansDuployan-Regular.ttf'), document.fonts.ready]);
  } catch (err) {
    $('status').textContent = 'Could not load the shorthand font. Reload the page to try again.';
    console.error(err);
    return;
  }
  document.querySelector('.mark-steno').textContent = toDuployan(wordToPhonemes('Duployé'));
  buildLegend();
  update({ inkAll: true });
  fit(false);
}
boot();
