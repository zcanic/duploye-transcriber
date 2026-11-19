// Dictation: a French word (from the vocabulary) or a number up to 9999 is shown in
// Duployé with its Chinese meaning; type the French. Accents, case and hyphens
// don't count. A first miss gives a second try; the second shows the answer.
import { ready } from './runtime.js';
import { SYSTEMS } from './systems.js';
import { InkSheet, buildItems, prepare } from './sheet.js';
import { frenchNumber, frenchOrdinal, randomNumber } from './numbers.js';
import { isRight } from './check.js';
import { grade } from './deck.js';

const sys = SYSTEMS.fr;
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');

const state = {
  mode: store.get('duploye.dictee.mode', 'words') === 'numbers' ? 'numbers' : 'words',
  speak: store.get('duploye.dictee.speak', true),
  right: 0, total: 0,
};
let words = [];       // [{fr, zh}]
let recent = [];      // keys of the last few questions, not repeated
let q = null;         // {fr, zh, num, key, tries, done}
let seq = 0;

// ---------- speech ----------
let voice = null;
const pickVoice = () => { voice = speechSynthesis.getVoices().find((v) => /^fr(-|_|$)/i.test(v.lang)) || null; };
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
function say(text) {
  if (!state.speak || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  if (voice) u.voice = voice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

// ---------- questions ----------
async function loadWords() {
  const data = await (await fetch(new URL('../data/vocab-fr.json', import.meta.url))).json();
  // single words and short set phrases; skip patterns like "être en (pleine) forme" or "début / mi- / fin"
  words = data.topics.flatMap((t) => t.cards)
    .filter(([fr, , , zh]) => zh && fr.length <= 28 && !/[()/…+.?!0-9]/.test(fr))
    .map(([fr, pos, , zh]) => ({ fr, zh, id: `${fr.toLowerCase()}|${pos}` })); // id: the same card in Cards
}

// now and then (1 in 6) a number is asked as an ordinal: 21ᵉ -> vingt et unième
const numberQuestion = (n) => (n > 0 && Math.random() < 1 / 6
  ? { fr: frenchOrdinal(n), zh: String(n), sup: n === 1 ? 'er' : 'e', num: true, key: `o${n}` }
  : { fr: frenchNumber(n), zh: String(n), num: true, key: `n${n}` });

// What you miss comes back a few questions later; each time you then get it
// right, the gap grows (about 3, 8, then 20 questions) until it leaves the
// queue. Another miss starts it over.
const GAPS = [3, 8, 20];
let asked = 0;
let review = []; // [{q, at}]
let lastWasReview = false;

function pick() {
  asked++;
  // never two reviews in a row, so new questions keep coming even after a bad streak
  const due = lastWasReview ? -1 : review.findIndex((r) => r.at <= asked && r.q.num === (state.mode === 'numbers'));
  lastWasReview = due >= 0;
  if (due >= 0) {
    const [{ q: again }] = review.splice(due, 1);
    recent = [again.key, ...recent].slice(0, 40);
    return { ...again, tries: 0, done: false };
  }
  for (let i = 0; i < 30; i++) {
    const next = state.mode === 'numbers'
      ? numberQuestion(randomNumber())
      : ((w) => ({ fr: w.fr, zh: w.zh, id: w.id, num: false, key: w.fr }))(words[Math.floor(Math.random() * words.length)]);
    if (!recent.includes(next.key)) { recent = [next.key, ...recent].slice(0, 40); return { ...next, tries: 0, done: false }; }
  }
  return null;
}

const steno = $('steno');
// larger writing on wide screens, where the sheet is larger too (see dictee.css)
const wide = matchMedia('(min-width: 900px) and (min-height: 640px)');
const sheet = new InkSheet(steno.querySelector('g'), { unit: 0.06, width: () => (wide.matches ? 500 : Math.min(380, innerWidth - 88)), gloss: () => false, maxInkMs: 1600 });
// write the French in full (no sigles) with the open vowels marked: the house rule
const itemsOf = (fr) => buildItems(fr.replace(/,/g, ' '), sys, { useSigles: false, accents: true });

async function ask() {
  const n = ++seq;
  const next = pick();
  if (!next) return;
  await sys.load(next.fr);
  const items = itemsOf(next.fr);
  await prepare(items, sys);
  if (n !== seq) return;
  const body = $('body');
  const swap = () => {
    q = next;
    $('sheet').classList.remove('right', 'wrong');
    $('ask').classList.remove('right', 'wrong');
    $('prompt').textContent = q.zh; // the Chinese, or the digits for a number
    if (q.sup) $('prompt').append(Object.assign(document.createElement('sup'), { textContent: q.sup }));
    $('prompt').classList.toggle('num', q.num);
    $('answer').textContent = ''; // filled in only when revealed
    $('note').textContent = '';
    $('note').classList.remove('again');
    $('go').classList.remove('done');
    $('go').setAttribute('aria-label', 'Check');
    $('reveal').style.visibility = '';
    const guess = $('guess');
    guess.value = '';
    guess.readOnly = false;
    // the sheet is faded out here: drop the last question's strokes at once (no leftovers)
    sheet.stop();
    sheet.root.replaceChildren();
    sheet.nodes.clear();
    sheet.unit = wide.matches ? 0.078 : 0.06;
    const size = sheet.set(items, sys, { inkAll: true, ink: false });
    const pad = 14, w = size.used + pad * 2, h = size.h + pad * 2;
    steno.setAttribute('viewBox', `${-pad} ${-pad} ${w} ${h}`);
    steno.setAttribute('width', w);
    steno.setAttribute('height', h);
    sheet.replay(reduceMotion.matches ? 0 : 120);
    body.classList.remove('out');
    if (!coarse.matches || document.activeElement === guess) guess.focus({ preventScroll: true });
  };
  if (!q || reduceMotion.matches) { swap(); return; }
  body.classList.add('out');
  setTimeout(() => n === seq && swap(), 200);
}

// Vocabulary results reach the flashcards: a miss puts the word on tomorrow's
// review there; spelling it right while it is due counts as that review.
function syncCard(id, clean) {
  const progress = store.get('duploye.cards.progress', {});
  const p = progress[id];
  if (clean && !(p?.box && p.due <= Date.now())) return;
  progress[id] = grade(p, clean);
  store.set('duploye.cards.progress', progress);
}

function settle(right) {
  q.done = true;
  state.total++;
  const clean = right && !q.tries;
  const step = clean ? (q.step ?? -1) + 1 : 0; // undefined step: a new question
  if (!clean || q.step !== undefined) {
    if (step < GAPS.length) review.push({ q: { ...q, step }, at: asked + GAPS[step] + Math.floor(Math.random() * 3) });
  }
  if (q.id) syncCard(q.id, clean);
  if (right) state.right++;
  $('score').textContent = `${state.right} / ${state.total}`;
  $('answer').textContent = q.fr;
  $('sheet').classList.add(right ? 'right' : 'wrong');
  $('ask').classList.add(right ? 'right' : 'wrong');
  $('guess').readOnly = true;
  $('go').classList.add('done');
  $('go').setAttribute('aria-label', 'Next');
  $('reveal').style.visibility = 'hidden'; // the answer is already showing
  $('note').classList.remove('again');
  $('note').textContent = right ? '对了' : '答案在上面 · 回车下一个';
  say(q.fr.split(/\s*,\s*/)[0]);
  if (right) {
    const at = q;
    setTimeout(() => { if (q === at) ask(); }, 1300);
  }
}

function check() {
  if (!q) return;
  if (q.done) { ask(); return; }
  const typed = $('guess').value;
  if (!typed.trim()) { $('guess').focus(); return; }
  if (isRight(typed, q.fr)) { settle(true); return; }
  q.tries++;
  if (q.tries >= 2) { settle(false); return; }
  const s = $('sheet');
  s.classList.remove('shake');
  void s.offsetWidth; // restart the animation
  s.classList.add('shake');
  $('note').textContent = '不太对，再试一次';
  $('note').classList.add('again');
  $('guess').select();
}

$('ask').addEventListener('submit', (e) => { e.preventDefault(); check(); });
$('reveal').addEventListener('click', () => { if (q && !q.done) settle(false); });
$('guess').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && q && !q.done) { e.preventDefault(); settle(false); }
});
$('guess').addEventListener('input', () => { if (q && !q.done && q.tries) { $('note').textContent = ''; $('note').classList.remove('again'); } });

for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => {
    if (state.mode === b.dataset.mode) return;
    state.mode = b.dataset.mode;
    store.set('duploye.dictee.mode', state.mode);
    for (const o of document.querySelectorAll('[data-mode]')) o.setAttribute('aria-pressed', String(o === b));
    recent = [];
    ask();
  });
}
$('speakToggle').addEventListener('click', () => {
  state.speak = !state.speak;
  store.set('duploye.dictee.speak', state.speak);
  $('speakToggle').setAttribute('aria-pressed', String(state.speak));
  if (!state.speak && 'speechSynthesis' in window) speechSynthesis.cancel();
});

// ---------- boot ----------
(async () => {
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  $('speakToggle').setAttribute('aria-pressed', String(state.speak));
  try {
    await Promise.all([ready('fr'), loadWords(), window.__pageReveal]);
  } catch (err) {
    console.error(err);
    $('note').textContent = '加载失败，请刷新重试。';
    return;
  }
  ask();
})();
