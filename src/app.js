import { SYSTEMS, parsePhonemes } from './systems.js';
import { loadFont } from './shaper.js';
import { InkSheet, buildItems, signSvg } from './sheet.js';

// ---------- constants ----------
const NS = 'http://www.w3.org/2000/svg';
const UNIT = 0.056;            // world px per font unit (56 px per em at 100 %)
const pageWidth = () => (innerWidth < 640 ? 540 : 960); // writing width, world px (narrower on phones = larger text)
const GRID = 24;               // dot spacing at 100 %
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- state ----------
const LANG0 = store.get('duploye.lang', 'fr') === 'en' ? 'en' : 'fr';
const textKey = (lang) => `duploye.v2.text.${lang}`;
const state = {
  lang: LANG0,
  text: store.get(textKey(LANG0), LANG0 === 'fr' ? store.get('duploye.v2.text', SYSTEMS.fr.sample) : SYSTEMS.en.sample),
  overrides: Object.fromEntries(Object.entries(store.get('duploye.overrides', {})).map(([k, v]) => [k.includes(':') ? k : `fr:${k}`, v])),
  gloss: store.get('duploye.gloss', true),
  sigles: store.get('duploye.sigles', true),
  sel: null,                    // { text: lowercased, n: occurrence }
};
const view = { x: 0, y: 0, k: 1 };
let model = [];                 // laid-out items
let content = { w: 960, h: 100 };

const stage = $('stage'), world = $('world'), ink = $('ink');
const sys = () => SYSTEMS[state.lang];
const toDuployan = (tokens) => sys().toDuployan(tokens);
const overrideKey = (word) => `${state.lang}:${word.toLowerCase()}`;
const sheet = new InkSheet(ink, { unit: UNIT, width: pageWidth, gloss: () => state.gloss, interactive: true });
const langOverrides = () => {
  const pre = `${state.lang}:`, out = {};
  for (const [k, v] of Object.entries(state.overrides)) if (k.startsWith(pre)) out[k.slice(pre.length)] = v;
  return out;
};

// ---------- update cycle ----------
function update({ inkAll = false } = {}) {
  const items = buildItems(state.text, sys(), { useSigles: state.sigles, overrides: langOverrides() });
  content = sheet.set(items, sys(), { inkAll });
  model = items;
  syncSelection();
  const words = items.filter((i) => i.kind === 'word');
  const edited = words.filter((w) => w.edited).length;
  $('status').textContent = `${words.length} word${words.length === 1 ? '' : 's'}${edited ? ` · ${edited} edited` : ''}`;
}
const stopInk = () => sheet.stop();

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
  for (const g of sheet.nodes.values()) g.classList.toggle('sel', !!it && g === it.node);
  const insp = $('inspector');
  if (!it) { insp.hidden = true; state.sel = null; $('drawerHint').textContent = 'Select a word, then tap a sign to add it.'; return; }
  $('drawerHint').textContent = `Tap a sign to add it to “${it.text}”.`;
  const part = editablePart(it);
  $('inspWord').textContent = it.text;
  $('inspNote').textContent = !part ? 'Word sign (sigle): a fixed abbreviation.'
    : it.edited ? 'Sounds edited by you.'
    : state.lang === 'en' && !it.guessed ? 'Sounds from the CMU dictionary. Tap a sound to remove it.'
    : state.lang === 'en' ? 'Not in the dictionary, so guessed from spelling. Check it.'
    : 'Sounds guessed from spelling. Tap a sound to remove it.';
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
  state.overrides[overrideKey(part.text)] = tokens.join(' ');
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
    p.innerHTML = sys().groups.flatMap(([, ts]) => ts).map((t) => `<button type="button" class="chip" data-add="${esc(t)}" title="Add ${esc(t)}">${glyphSvg(t)}<span>${esc(t)}</span></button>`).join('');
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
  delete state.overrides[overrideKey(part.text)];
  store.set('duploye.overrides', state.overrides);
  update();
});
$('inspClose').addEventListener('click', () => select(null));
const popLast = () => { const c = $('chips').querySelectorAll('.chip'); c[c.length - 1]?.classList.add('pop'); };

// ---------- mini glyphs (chips, legend) ----------
const glyphSvg = (token) => signSvg(sys(), token);

function buildLegend() {
  const { groups, hints } = sys();
  $('legend').innerHTML = groups.map(([name, ts]) =>
    `<div class="grp">${name}</div>` + ts.map((t) => `<button type="button" class="chip" data-add="${esc(t)}" title="${esc(hints[t] || t)}">${glyphSvg(t)}<span>${esc(t)}</span></button>`).join('')).join('');
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

// language switch
async function setLang(lang) {
  if (lang === state.lang) return;
  clearTimeout(typing);
  store.set(textKey(state.lang), src.value);
  state.lang = lang;
  store.set('duploye.lang', lang);
  syncLangUI();
  state.text = store.get(textKey(lang), sys().sample);
  src.value = state.text;
  autosize();
  select(null);
  $('palette').replaceChildren();
  stopInk();
  if (!(await loadSystem())) return;
  await window.__pageReveal; // let the page transition finish before shaping and inking
  buildLegend();
  update({ inkAll: true });
  fit();
}
function syncLangUI() {
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
  src.placeholder = sys().placeholder;
  document.documentElement.lang = state.lang;
  $('sigles').title = state.lang === 'en' ? 'Use word signs' : 'Use abbreviations (sigles)';
}
async function loadSystem() {
  const lang = state.lang;
  $('status').textContent = lang === 'en' ? 'Loading the English dictionary…' : 'Loading…';
  try { await sys().ready(); } catch (err) {
    console.error(err);
    $('status').textContent = 'Could not load the English dictionary. Check your connection and switch again.';
    return false;
  }
  return lang === state.lang;
}
document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

// composer
const src = $('src');
const autosize = () => { src.style.height = 'auto'; src.style.height = `${src.scrollHeight}px`; syncDock(); };
let typing = 0;
src.addEventListener('input', () => {
  autosize();
  clearTimeout(typing);
  typing = setTimeout(() => {
    state.text = src.value;
    store.set(textKey(state.lang), state.text);
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
  syncLangUI();
  setToggle('gloss', state.gloss);
  setToggle('sigles', state.sigles);
  $('status').textContent = 'Loading the pen…';
  try {
    await Promise.all([loadFont(new URL('../fonts/NotoSansDuployan-Regular.ttf', import.meta.url).href), document.fonts.ready]);
  } catch (err) {
    $('status').textContent = 'Could not load the shorthand font. Reload the page to try again.';
    console.error(err);
    return;
  }
  if (!(await loadSystem())) return;
  buildLegend();
  update({ inkAll: true });
  fit(false);
}
boot();
