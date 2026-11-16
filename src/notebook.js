// Notebook: Markdown with live shorthand cells, for lessons and handouts.
//
//   ---
//   title: Lesson 1
//   lang: fr              # fr (Duployé) or en (Sloan-Duployan)
//   ---
//   Ordinary **Markdown**: headings, paragraphs, lists, tables, > notes, `code`, [links](…).
//
//   ```steno            a live, editable cell; add "sounds" to list each word's sounds,
//   pour vous faire     "nogloss" to hide the words under the shorthand, "nosigles" to spell out
//   ```                 abbreviations, "lang=en" to switch system for this cell only
//
//   ```signs            a table of single signs at true scale (tokens separated by spaces;
//   P B T D             one row per line)
//   ```
//
//   ```write            write-it-yourself drills: the word is shown, the answer is hidden.
//   homme               "word = o M" fixes the expected sounds when the rules guess wrong
//   ```
//
//   ```read             reading drills: the shorthand is shown, the word is hidden
//   coke
//   ```
//
// All text is escaped; only the Markdown subset above becomes markup.
import { ready } from './runtime.js';
import { SYSTEMS, parsePhonemes } from './systems.js';
import { InkSheet, buildItems, keyItems, signSvg, prepare, prepareSigns } from './sheet.js';

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Markdown subset ----------
function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
    const raw = href.replace(/&amp;/g, '&');
    const ok = /^(https?:\/\/|#|\.{0,2}\/|[\w-]+\.(html|md)\b)/i.test(raw) && !/^\s*javascript:/i.test(raw);
    if (!ok) return t;
    const ext = /^https?:/i.test(raw);
    return `<a href="${esc(raw)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
  });
  return s;
}

export function parse(md) {
  const meta = {};
  let src = md.replace(/\r\n?/g, '\n');
  const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
      if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    src = src.slice(fm[0].length);
  }
  const blocks = [];
  const lines = src.split('\n');
  let i = 0;
  const isBreak = (l) => /^(#{1,4}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\||---\s*$)/.test(l) || l.trim() === '';
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === '') { i++; continue; }
    let m;
    if ((m = l.match(/^```\s*([\w-]+)?\s*(.*)$/))) {
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'fence', lang: (m[1] || '').toLowerCase(), opts: m[2].split(/\s+/).filter(Boolean), body: body.join('\n') });
    } else if ((m = l.match(/^(#{1,4})\s+(.*)$/))) {
      blocks.push({ type: 'h', level: m[1].length, text: m[2] }); i++;
    } else if (/^---\s*$/.test(l)) {
      blocks.push({ type: 'hr' }); i++;
    } else if (l.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'note', text: body.join('\n') });
    } else if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) {
        let item = lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(item);
      }
      blocks.push({ type: 'list', ordered, items });
    } else if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(/^\|[\s:-]+\|/.test(rows[1] || '') ? 2 : 1).map(cells);
      blocks.push({ type: 'table', head, body });
    } else {
      const body = [];
      while (i < lines.length && !isBreak(lines[i])) body.push(lines[i++]);
      if (!body.length) body.push(lines[i++]);
      blocks.push({ type: 'p', text: body.join(' ') });
    }
  }
  return { meta, blocks };
}

// ---------- cells ----------
const cellOpts = (opts, meta) => {
  const o = { lang: meta.lang === 'en' ? 'en' : 'fr', sounds: false, gloss: true, sigles: true };
  for (const t of opts) {
    if (t === 'sounds') o.sounds = true;
    else if (t === 'nogloss') o.gloss = false;
    else if (t === 'nosigles') o.sigles = false;
    else if (/^lang=(fr|en)$/.test(t)) o.lang = t.slice(5);
  }
  return o;
};

function makeSheetBox(cls = 'nb-paper') {
  const box = document.createElement('div');
  box.className = cls;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'nb-svg');
  svg.setAttribute('role', 'img');
  const g = document.createElementNS(NS, 'g');
  svg.append(g);
  box.append(svg);
  return { box, svg, g };
}

// Fit the SVG to the laid-out words and remember the sheet's size.
function sizeSvg(svg, size, pad = 18, fit = false) {
  const h = size.h + pad * 2;
  const w = (fit ? size.used : size.w) + pad * 2;
  svg.setAttribute('viewBox', `${-pad} ${-pad} ${w} ${h}`);
  svg.style.height = `${h}px`;
  if (fit) svg.style.width = `${w}px`;
}

const onVisible = (el, fn) => {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: '0px 0px -12% 0px' });
  io.observe(el);
};

function stenoCell(block, meta) {
  const o = cellOpts(block.opts, meta);
  const sys = SYSTEMS[o.lang];
  const cell = document.createElement('figure');
  cell.className = 'nb-cell nb-steno';
  const bar = document.createElement('div');
  bar.className = 'nb-bar';
  bar.innerHTML = `<span class="nb-tag">${o.lang === 'en' ? 'Sloan-Duployan' : 'Duployé'}</span>
    <button type="button" class="nb-btn" data-act="edit" aria-pressed="false">Edit</button>
    <button type="button" class="nb-btn" data-act="replay" aria-label="Write again">Write again</button>`;
  const input = document.createElement('textarea');
  input.className = 'nb-input';
  input.rows = 1;
  input.spellcheck = false;
  input.value = block.body.trim();
  input.hidden = true;
  input.setAttribute('aria-label', 'Text of this cell');
  const { box, svg, g } = makeSheetBox();
  const sounds = document.createElement('div');
  sounds.className = 'nb-sounds';
  sounds.hidden = !o.sounds;
  cell.append(bar, input, box, sounds);

  const sheet = new InkSheet(g, { unit: 0.05, width: () => Math.max(160, box.clientWidth - 36), gloss: () => o.gloss, maxInkMs: 4000 });
  let shown = false, drawSeq = 0;
  const draw = async (opts = {}) => {
    const n = ++drawSeq;
    const items = buildItems(input.value, sys, { useSigles: o.sigles });
    await prepare(items, sys); // shaped in the worker
    if (n !== drawSeq) return;
    sizeSvg(svg, sheet.set(items, sys, opts));
    if (o.sounds) {
      sounds.innerHTML = items.filter((i) => i.kind === 'word').map((i) =>
        `<span class="nb-snd"><b>${esc(i.text)}</b> ${esc(i.tokens.join(' ') || '—')}${i.sigle ? ' <i>sigle</i>' : ''}</span>`).join('');
    }
  };
  onVisible(cell, () => { shown = true; draw({ inkAll: true }); });
  let t = 0;
  input.addEventListener('input', () => {
    input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`;
    clearTimeout(t); t = setTimeout(() => draw(), 160);
  });
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'replay') sheet.replay();
    if (b.dataset.act === 'edit') {
      input.hidden = !input.hidden;
      b.setAttribute('aria-pressed', String(!input.hidden));
      if (!input.hidden) { input.style.height = `${input.scrollHeight}px`; input.focus(); }
    }
  });
  new ResizeObserver(() => { if (shown) draw({ ink: false }); }).observe(box);
  return cell;
}

function signsCell(block, meta) {
  const o = cellOpts(block.opts, meta);
  const sys = SYSTEMS[o.lang];
  const cell = document.createElement('figure');
  cell.className = 'nb-cell nb-signs';
  for (const row of block.body.split('\n').map((r) => r.trim()).filter(Boolean)) {
    const r = document.createElement('div');
    r.className = 'nb-signrow';
    r.innerHTML = row.split(/\s+/).map((t) => {
      if (!sys.tokens.includes(t)) return `<span class="nb-sign bad" title="Unknown sign">${esc(t)}?</span>`;
      const hint = sys.hints[t];
      return `<span class="nb-sign"><span class="glyph" data-sign="${esc(t)}"></span><b>${esc(t)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span>`;
    }).join('');
    cell.append(r);
  }
  const tokens = [...cell.querySelectorAll('[data-sign]')].map((x) => x.dataset.sign);
  prepareSigns(sys, tokens).then(() => {
    for (const x of cell.querySelectorAll('[data-sign]')) x.outerHTML = signSvg(sys, x.dataset.sign);
  });
  return cell;
}

// Drills: each line is "word" or "word = S O U N D S".
function drillCell(block, meta, mode) {
  const o = cellOpts(block.opts, meta);
  const sys = SYSTEMS[o.lang];
  const cell = document.createElement('figure');
  cell.className = `nb-cell nb-drill nb-${mode}`;
  const head = document.createElement('div');
  head.className = 'nb-bar';
  head.innerHTML = `<span class="nb-tag">${mode === 'write' ? 'Write it, then check' : 'Read it, then check'}</span>
    <button type="button" class="nb-btn" data-act="all">Show all</button>`;
  const list = document.createElement('ol');
  list.className = 'nb-drills';
  cell.append(head, list);
  const entries = block.body.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [word, fix] = l.split('=').map((x) => x.trim());
    return { word, fix };
  });
  const itemsFor = (e) => {
    if (e.fix) {
      const items = [{ kind: 'word', text: e.word, parts: [], tokens: parsePhonemes(e.fix, sys).tokens }];
      return keyItems(items);
    }
    return buildItems(e.word, sys, { useSigles: o.sigles });
  };
  const reveals = [];
  entries.forEach((e, idx) => {
    const li = document.createElement('li');
    li.className = 'nb-drill-item';
    const { box, svg, g } = makeSheetBox('nb-paper small');
    const sheet = new InkSheet(g, { unit: 0.042, width: () => 220, gloss: () => false, maxInkMs: 1800 });
    const label = document.createElement('span');
    label.className = 'nb-word';
    const sounds = document.createElement('span');
    sounds.className = 'nb-answer-sounds';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nb-btn';
    const items = itemsFor(e);
    const shaped = prepare(items, sys); // start shaping now; reveal waits for it
    const tokens = items.filter((i) => i.kind === 'word').map((i) => i.tokens.join(' ') + (i.sigle ? ' (sigle)' : '')).join(' · ');
    let open = false;
    if (mode === 'write') {
      label.textContent = e.word;
      box.hidden = true;
      btn.textContent = 'Check';
    } else {
      label.textContent = '?';
      label.classList.add('hidden-word');
      btn.textContent = 'Show word';
      onVisible(li, () => shaped.then(() => sizeSvg(svg, sheet.set(items, sys), 10, true)));
    }
    const reveal = () => {
      if (open) return;
      open = true;
      btn.hidden = true;
      li.classList.add('open');
      if (mode === 'write') shaped.then(() => { box.hidden = false; sizeSvg(svg, sheet.set(items, sys), 10, true); });
      else { label.textContent = e.word; label.classList.remove('hidden-word'); }
      sounds.textContent = tokens;
    };
    reveals.push(reveal);
    btn.addEventListener('click', reveal);
    btn.setAttribute('aria-label', `${btn.textContent} ${idx + 1}`);
    li.append(label, box, sounds, btn);
    list.append(li);
  });
  head.querySelector('[data-act=all]').addEventListener('click', () => reveals.forEach((r, k) => setTimeout(r, k * 120)));
  return cell;
}

/**
 * Render a notebook into a container. Resolves once the shorthand engine is ready.
 * @returns {Promise<{meta: object, headings: {id:string,text:string,level:number}[]}>}
 */
export async function renderNotebook(md, container) {
  const { meta, blocks } = parse(md);
  const langs = new Set([meta.lang === 'en' ? 'en' : 'fr']);
  for (const b of blocks) if (b.type === 'fence') for (const t of b.opts) if (/^lang=(fr|en)$/.test(t)) langs.add(t.slice(5));
  await Promise.all([...langs].map((l) => ready(l)));
  const frag = document.createDocumentFragment();
  const headings = [];
  let hn = 0;
  for (const b of blocks) {
    let node;
    if (b.type === 'h') {
      node = document.createElement(`h${Math.min(4, b.level + 0)}`);
      node.innerHTML = inline(b.text);
      node.id = `s${++hn}`;
      headings.push({ id: node.id, text: node.textContent, level: b.level });
    } else if (b.type === 'p') { node = document.createElement('p'); node.innerHTML = inline(b.text); }
    else if (b.type === 'hr') node = document.createElement('hr');
    else if (b.type === 'note') { node = document.createElement('aside'); node.className = 'nb-note'; node.innerHTML = b.text.split(/\n{2,}/).map((p) => `<p>${inline(p.replace(/\n/g, ' '))}</p>`).join(''); }
    else if (b.type === 'list') { node = document.createElement(b.ordered ? 'ol' : 'ul'); node.innerHTML = b.items.map((x) => `<li>${inline(x)}</li>`).join(''); }
    else if (b.type === 'table') {
      node = document.createElement('div');
      node.className = 'nb-table';
      node.innerHTML = `<table><thead><tr>${b.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${
        b.body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    } else if (b.type === 'fence') {
      if (b.lang === 'steno') node = stenoCell(b, meta);
      else if (b.lang === 'signs') node = signsCell(b, meta);
      else if (b.lang === 'write' || b.lang === 'read') node = drillCell(b, meta, b.lang);
      else { node = document.createElement('pre'); node.innerHTML = `<code>${esc(b.body)}</code>`; }
    }
    if (node) frag.append(node);
  }
  container.replaceChildren(frag);
  return { meta, headings };
}
