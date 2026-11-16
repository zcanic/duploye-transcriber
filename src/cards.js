// Flashcards: French vocabulary written in Duployé, with spaced repetition.
// Front: shorthand + Chinese (or + French); back: the other side. Tap to flip,
// swipe right for "remembered", left for "again".
import { ready } from './runtime.js';
import { SYSTEMS } from './systems.js';
import { InkSheet, buildItems } from './sheet.js';
import { parseDeck, grade, buildSession, stats, streak } from './deck.js';

const NS = 'http://www.w3.org/2000/svg';
const sys = SYSTEMS.fr;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const todayKey = () => new Date().toISOString().slice(0, 10);

const state = {
  mode: store.get('duploye.cards.mode', 'zh') === 'fr' ? 'fr' : 'zh',
  topic: store.get('duploye.cards.topic', 'all'),
  speak: store.get('duploye.cards.speak', true),
  progress: store.get('duploye.cards.progress', {}),
  days: store.get('duploye.cards.days', []),
  today: store.get('duploye.cards.today', { day: '', n: 0 }),
};
let topics = [];        // [{topic, cards}]
let session = null;     // {queue, i, good, again, total, retried:Set}
let current = null;     // {el, card, sheet, flipped}
const stage = $('stage');

// ---------- deck ----------
async function loadDeck() {
  const builtIn = await (await fetch(new URL('../data/vocab-fr.json', import.meta.url))).json();
  const custom = store.get('duploye.cards.custom', []);
  topics = [...builtIn.topics, ...custom].map(({ topic, cards }) => ({
    topic,
    cards: cards.map(([fr, pos, en, zh]) => ({ id: `${fr.toLowerCase()}|${pos}`, fr, pos, en, zh, topic })),
  }));
}
const pretty = (topic) => topic.replace(/-/g, ' ');
const cardsOf = (topic) => (topic === 'all' ? topics.flatMap((t) => t.cards) : topics.find((t) => t.topic === topic)?.cards || []);

function renderTopics() {
  const now = Date.now();
  const chip = (id, label, cards) => {
    const s = stats(cards, state.progress, now);
    const badge = s.due ? `<small class="due">${s.due}</small>` : `<small>${s.total}</small>`;
    return `<button type="button" class="topic" role="tab" data-topic="${esc(id)}" aria-selected="${state.topic === id}" title="${s.due} due · ${s.fresh} new · ${s.known} known">${esc(label)}${badge}</button>`;
  };
  $('topics').innerHTML = chip('all', '全部', cardsOf('all')) + topics.map((t) => chip(t.topic, pretty(t.topic), t.cards)).join('');
  $('topics').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// ---------- speech ----------
let voice = null;
const pickVoice = () => { voice = speechSynthesis.getVoices().find((v) => /^fr(-|_|$)/i.test(v.lang)) || null; };
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
function say(text, force = false) {
  if ((!state.speak && !force) || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  if (voice) u.voice = voice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

// ---------- a card ----------
const posClass = (pos) => (/n\.m/.test(pos) ? 'm' : /n\.f/.test(pos) ? 'f' : '');
const sayBtn = '<button type="button" class="icon-btn say" data-say aria-label="Read aloud"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8h3l4-3v10l-4-3H4z"/><path class="wave" d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.4 6.4 0 0 1 0 9"/></svg></button>';

function makeCard(card) {
  const el = document.createElement('div');
  el.className = 'card enter';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-roledescription', 'flashcard');
  const frontText = state.mode === 'zh' ? `<div class="prompt-zh">${esc(card.zh)}</div>` : `<div class="prompt-fr">${esc(card.fr)}</div>`;
  const backMain = state.mode === 'zh' ? `<div class="answer-fr">${esc(card.fr)}</div>` : `<div class="answer-zh">${esc(card.zh)}</div>`;
  el.innerHTML = `<div class="stamp again">再练</div><div class="stamp good">记住</div>
    <div class="flipper">
      <div class="face front"><span class="tag">${esc(pretty(card.topic))}</span>${state.mode === 'fr' ? sayBtn : ''}<div class="ink-slot"></div>${frontText}<div class="hint">点击翻面</div></div>
      <div class="face back"><span class="tag">${esc(pretty(card.topic))}</span>${sayBtn}${backMain}
        <div class="meta">${card.pos ? `<span class="pos ${posClass(card.pos)}">${esc(card.pos)}</span>` : ''}${card.en ? `<span>${esc(card.en)}</span>` : ''}${state.mode === 'fr' ? '' : ''}</div>
        <div class="mini-slot"></div><div class="sounds"></div></div>
    </div>`;

  // shorthand on the front, written with the shared ink sheet
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'steno');
  svg.setAttribute('aria-label', `Duployé: ${card.fr}`);
  const g = document.createElementNS(NS, 'g');
  svg.append(g);
  el.querySelector('.ink-slot').replaceWith(svg);
  const sheet = new InkSheet(g, { unit: 0.06, width: () => Math.min(340, innerWidth - 90), gloss: () => false, maxInkMs: 1500 });
  const items = buildItems(card.fr.replace(/,/g, ' '), sys, { useSigles: false });
  const size = sheet.set(items, sys, { ink: false });
  const pad = 14, w = size.used + pad * 2, h = size.h + pad * 2;
  svg.setAttribute('viewBox', `${-pad} ${-pad} ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  // a small copy on the back, plus the sounds, to connect word and strokes
  const mini = svg.cloneNode(true);
  mini.setAttribute('class', 'steno mini-steno');
  mini.removeAttribute('width'); mini.removeAttribute('height');
  el.querySelector('.mini-slot').replaceWith(mini);
  el.querySelector('.sounds').textContent = items.filter((i) => i.kind === 'word').map((i) => i.tokens.join(' ')).join(' · ');
  if (!items.some((i) => i.kind === 'word' && i.tokens.length)) svg.remove(); // nothing to write (e.g. an abbreviation)
  sheet.replay(9999); // keep the strokes hidden until this card is in front
  return { el, card, sheet, flipped: false };
}

// ---------- session ----------
function startSession() {
  const cards = cardsOf(state.topic);
  const queue = buildSession(cards, state.progress, { size: 20, newCards: 12 });
  session = { queue, i: 0, good: 0, again: 0, total: queue.length, retried: new Set() };
  clearStage();
  if (!queue.length) { showSummary(true); return; }
  showNext(true);
}

function clearStage() {
  for (const el of stage.querySelectorAll('.card')) el.remove();
  current = null;
}

function updateMeter() {
  const done = session ? session.i : 0;
  const total = session ? Math.max(session.queue.length, 1) : 1;
  $('barFill').style.transform = `scaleX(${done / total})`;
  $('count').textContent = session ? `${Math.min(done + (current ? 1 : 0), session.queue.length)} / ${session.queue.length}` : '';
  const left = session ? session.queue.length - session.i : 0;
  stage.querySelector('.g1').style.opacity = left > 1 ? '' : '0';
  stage.querySelector('.g2').style.opacity = left > 2 ? '' : '0';
}

function showNext(first = false) {
  if (session.i >= session.queue.length) { current = null; updateMeter(); showSummary(false); return; }
  const c = makeCard(session.queue[session.i]);
  const below = stage.querySelector('.card');
  if (below) stage.insertBefore(c.el, below); else stage.append(c.el);
  current = c;
  stage.classList.remove('empty');
  updateMeter();
  // rise from the stack, then write the shorthand
  requestAnimationFrame(() => requestAnimationFrame(() => c.el.classList.remove('enter')));
  c.sheet.replay(reduceMotion.matches ? 0 : first ? 350 : 260);
  if (state.mode === 'fr') setTimeout(() => current === c && say(c.card.fr), 500);
  enableControls(true);
}

function flip() {
  if (!current) return;
  current.flipped = !current.flipped;
  current.el.classList.toggle('flipped', current.flipped);
  if (current.flipped && state.mode === 'zh') say(current.card.fr);
}

function answer(known, fromSwipe = false) {
  if (!current || !session) return;
  const c = current;
  const { card } = c;
  state.progress[card.id] = grade(state.progress[card.id], known);
  store.set('duploye.cards.progress', state.progress);
  const day = todayKey();
  if (!state.days.includes(day)) { state.days.push(day); state.days = state.days.slice(-400); store.set('duploye.cards.days', state.days); }
  state.today = state.today.day === day ? { day, n: state.today.n + 1 } : { day, n: 1 };
  store.set('duploye.cards.today', state.today);
  if (known) session.good++; else {
    session.again++;
    // see it again a few cards later, once per session
    if (!session.retried.has(card.id)) { session.retried.add(card.id); session.queue.splice(Math.min(session.i + 4, session.queue.length), 0, card); }
  }
  // fly away in the direction of the answer
  const dir = known ? 1 : -1;
  const el = c.el;
  el.classList.remove('dragging', 'spring');
  el.classList.add('leaving');
  const dy = fromSwipe ? (parseFloat(el.dataset.dy) || 0) : 0;
  el.style.transform = `translate3d(${dir * (innerWidth * 0.6 + 260)}px, ${dy + 40}px, 0) rotate(${dir * 22}deg)`;
  el.style.opacity = '0';
  el.querySelector(known ? '.stamp.good' : '.stamp.again').style.opacity = '1';
  setTimeout(() => el.remove(), 460);
  c.sheet.stop();
  session.i++;
  current = null;
  showNext();
  renderFooter();
}

function showSummary(nothingDue) {
  enableControls(false);
  stage.classList.add('empty');
  const el = document.createElement('div');
  el.className = 'card enter';
  const s = stats(cardsOf(state.topic), state.progress);
  el.innerHTML = nothingDue
    ? `<div class="face summary"><div class="big">✓</div><div>这个主题今天没有要复习的词了</div><div class="sub">已掌握 ${s.known} · 学习中 ${s.learning} · 共 ${s.total}</div><button type="button" class="primary" data-act="all">换成「全部」</button></div>`
    : `<div class="face summary"><div class="big">${session.good}<span style="font-size:.45em"> / ${session.good + session.again}</span></div>
        <div class="sub">这一组完成了</div>
        <div class="row"><div class="g"><b>${session.good}</b>记住</div><div class="a"><b>${session.again}</b>再练</div><div><b>${s.due}</b>还要复习</div></div>
        <button type="button" class="primary" data-act="again">再来一组</button></div>`;
  stage.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('enter')));
  el.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'again') startSession();
    if (act === 'all') setTopic('all');
  });
  $('barFill').style.transform = 'scaleX(1)';
  $('count').textContent = nothingDue ? '0 / 0' : `${session.queue.length} / ${session.queue.length}`;
  renderTopics();
}

function enableControls(on) { for (const b of document.querySelectorAll('.ctl')) b.disabled = !on; }

function renderFooter() {
  const n = streak(state.days);
  const today = state.today.day === todayKey() ? state.today.n : 0;
  $('streak').textContent = `${n ? `连续 ${n} 天 · ` : ''}今天 ${today} 张`;
}

function setTopic(topic) {
  state.topic = topic;
  store.set('duploye.cards.topic', topic);
  renderTopics();
  startSession();
}
function setMode(mode) {
  state.mode = mode;
  store.set('duploye.cards.mode', mode);
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  if (session && current) {
    // redraw the card in front with the new sides, keep the session
    const old = current.el;
    current.sheet.stop();
    old.remove();
    current = null;
    showNext();
  }
}

// ---------- gestures ----------
let drag = null;
stage.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.card');
  if (!el || !current || el !== current.el || e.target.closest('button')) return;
  drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, t: performance.now(), vx: 0, moved: false, id: e.pointerId };
  el.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || !current) return;
  const now = performance.now();
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.vx = (dx - drag.dx) / Math.max(1, now - drag.t);
  drag.dx = dx; drag.dy = dy; drag.t = now;
  if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; current.el.classList.add('dragging'); }
  if (!drag.moved) return;
  const el = current.el;
  el.dataset.dy = dy * 0.3;
  el.style.transform = `translate3d(${dx}px, ${dy * 0.3}px, 0) rotate(${dx * 0.055}deg)`;
  el.querySelector('.stamp.good').style.opacity = clamp(dx / 110, 0, 1);
  el.querySelector('.stamp.again').style.opacity = clamp(-dx / 110, 0, 1);
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!current) return;
  const el = current.el;
  if (!d.moved) { if (e.type === 'pointerup') flip(); return; }
  const fling = Math.abs(d.vx) > 0.55 && Math.abs(d.dx) > 30;
  if (d.dx > 110 || (fling && d.vx > 0)) { answer(true, true); return; }
  if (d.dx < -110 || (fling && d.vx < 0)) { answer(false, true); return; }
  el.classList.remove('dragging');
  el.classList.add('spring');
  el.style.transform = '';
  el.querySelector('.stamp.good').style.opacity = 0;
  el.querySelector('.stamp.again').style.opacity = 0;
  setTimeout(() => el.classList.remove('spring'), 560);
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]');
  if (b && current) { e.stopPropagation(); say(current.card.fr, true); }
});

// ---------- controls ----------
$('flipBtn').addEventListener('click', flip);
$('goodBtn').addEventListener('click', () => answer(true));
$('againBtn').addEventListener('click', () => answer(false));
$('topics').addEventListener('click', (e) => { const t = e.target.closest('[data-topic]'); if (t) setTopic(t.dataset.topic); });
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => setMode(b.dataset.mode));
$('speakToggle').addEventListener('click', () => {
  state.speak = !state.speak;
  store.set('duploye.cards.speak', state.speak);
  $('speakToggle').setAttribute('aria-pressed', String(state.speak));
  if (!state.speak && 'speechSynthesis' in window) speechSynthesis.cancel();
});
document.addEventListener('keydown', (e) => {
  const t = e.target instanceof Element ? e.target : null;
  if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea')) return;
  const k = e.key;
  if (k === ' ' || k === 'Enter') { if (t?.closest('button') && k === 'Enter') return; flip(); }
  else if (k === 'ArrowRight' || k === 'l') answer(true);
  else if (k === 'ArrowLeft' || k === 'h') answer(false);
  else if (k === 's' || k === 'S') { if (current) say(current.card.fr, true); }
  else return;
  e.preventDefault();
});

// ---------- import ----------
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('show'), 2200);
}
$('importBtn').addEventListener('click', () => $('importFiles').click());
$('importFiles').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const custom = store.get('duploye.cards.custom', []);
  let n = 0;
  for (const f of files) {
    const d = parseDeck(await f.text(), f.name);
    if (!d.cards.length) continue;
    const entry = { topic: d.topic, cards: d.cards.map((c) => [c.fr, c.pos, c.en, c.zh]) };
    const i = custom.findIndex((t) => t.topic === d.topic);
    if (i >= 0) custom[i] = entry; else custom.push(entry);
    n += d.cards.length;
  }
  e.target.value = '';
  if (!n) { toast('没有找到词条。每行的格式应为：- 法语 | 词性 | 英文 | 中文'); return; }
  store.set('duploye.cards.custom', custom);
  await loadDeck();
  renderTopics();
  toast(`导入了 ${n} 个词`);
});

// ---------- boot ----------
(async () => {
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  $('speakToggle').setAttribute('aria-pressed', String(state.speak));
  renderFooter();
  try {
    await Promise.all([ready('fr'), loadDeck(), window.__pageReveal]);
  } catch (err) {
    console.error(err);
    toast('词库加载失败，请刷新重试。');
    return;
  }
  if (state.topic !== 'all' && !topics.some((t) => t.topic === state.topic)) state.topic = 'all';
  renderTopics();
  startSession();
})();
