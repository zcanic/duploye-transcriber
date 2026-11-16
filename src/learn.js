// The lessons page: a list of notebooks (lessons/index.json) and the reader.
// Open a lesson with #fr-01, or any notebook on the web with ?src=<url of a .md file>.
import { renderNotebook, parse } from './notebook.js';
import { ready } from './runtime.js';
import { SYSTEMS } from './systems.js';
import { signSvg } from './sheet.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const article = $('lesson'), nav = $('lessons');
let index = [];
let alphaLang = 'fr';

// Alphabet card under the lesson list. Shown only when the sidebar has room for it.
function alphabetCard(lang) {
  const sys = SYSTEMS[lang];
  const card = document.createElement('section');
  card.className = 'alpha';
  card.setAttribute('aria-label', 'Alphabet');
  card.innerHTML = `<h2>Alphabet</h2>` + sys.groups.map(([, ts]) =>
    `<div class="alpha-grid">${ts.map((t) => `<span class="alpha-sign" title="${esc(sys.hints[t] || t)}">${signSvg(sys, t)}<b>${esc(t)}</b></span>`).join('')}</div>`).join('');
  return card;
}
function fitAlphabet() {
  const card = nav.querySelector('.alpha');
  if (!card) return;
  card.hidden = false;
  // the sidebar is sticky: the card stays only if the whole sidebar fits the window
  if (getComputedStyle(nav).position !== 'sticky' || nav.getBoundingClientRect().top + nav.scrollHeight > innerHeight - 16) card.hidden = true;
}
addEventListener('resize', fitAlphabet);

// The list is built once; switching lessons only moves the highlight and the ✓ marks,
// so the sidebar never re-renders (and never jumps).
let navBuilt = false, cardLang = null;
function buildNav() {
  const groups = [...new Set(index.map((l) => l.course))];
  nav.innerHTML = groups.map((course) => `<h2>${esc(course)}</h2><ol>${index.filter((l) => l.course === course).map((l) => l.soon
    ? `<li><a class="soon" aria-disabled="true"><span class="n">${esc(l.n)}</span><span>${esc(l.title)}</span><span>soon</span></a></li>`
    : `<li><a href="#${esc(l.id)}" data-id="${esc(l.id)}"><span class="n">${esc(l.n)}</span><span>${esc(l.title)}</span><span class="done" aria-label="read" hidden>✓</span></a></li>`).join('')}</ol>`).join('');
  navBuilt = true;
}
function syncNav(currentId, lang = cardLang || 'fr') {
  if (!navBuilt) buildNav();
  const done = new Set(store.get('duploye.lessons.seen', []));
  for (const a of nav.querySelectorAll('a[data-id]')) {
    if (a.dataset.id === currentId) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    a.querySelector('.done').hidden = !done.has(a.dataset.id);
  }
  if (cardLang !== lang) {
    nav.querySelector('.alpha')?.remove();
    nav.append(alphabetCard(lang));
    cardLang = lang;
  }
  fitAlphabet();
}

function pager(i) {
  const live = index.filter((l) => !l.soon);
  const k = live.findIndex((l) => l.id === live[i]?.id);
  const prev = live[k - 1], next = live[k + 1];
  const nav = document.createElement('nav');
  nav.className = 'pager';
  nav.setAttribute('aria-label', 'Lesson navigation');
  nav.innerHTML = `${prev ? `<a href="#${esc(prev.id)}"><small>Previous</small>${esc(prev.title)}</a>` : ''}${next ? `<a class="next" href="#${esc(next.id)}"><small>Next</small>${esc(next.title)}</a>` : ''}`;
  return nav;
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let firstShow = true, loadSeq = 0;

// Fetch the next lesson first, then swap it in at once: inside a view transition when
// switching lessons, after the page transition when arriving from the canvas.
async function show() {
  nav.classList.remove('open');
  $('menuBtn').setAttribute('aria-expanded', 'false');
  const external = new URLSearchParams(location.search).get('src');
  const live = index.filter((l) => !l.soon);
  let entry = null, url;
  if (external) {
    url = external;
  } else {
    const id = decodeURIComponent(location.hash.slice(1)) || live[0]?.id;
    entry = live.find((l) => l.id === id) || live[0];
    url = `lessons/${entry.file}`;
  }
  const seq = ++loadSeq;
  syncNav(entry?.id);
  if (firstShow) article.innerHTML = '<p class="loading">Loading the lesson…</p>';
  let md;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    md = await res.text();
    await ready(parse(md).meta.lang === 'en' ? 'en' : 'fr');
  } catch (err) {
    console.error(err);
    article.innerHTML = `<p class="err">Could not load ${esc(url)} (${esc(err.message)}). Check the address, then reload.</p>`;
    return;
  }
  if (seq !== loadSeq) return; // a newer click won

  const swap = async (instant) => {
    article.classList.remove('ready');
    article.classList.toggle('instant', instant);
    const { meta } = await renderNotebook(md, article);
    const title = meta.title || entry?.title || 'Notebook';
    const head = document.createElement('div');
    head.innerHTML = `${meta.kicker || entry ? `<p class="kicker">${esc(meta.kicker || `${entry.course} · ${entry.n}`)}</p>` : ''}<h1>${esc(title)}</h1>`;
    article.prepend(...head.childNodes);
    if (entry) {
      article.append(pager(live.indexOf(entry)));
      const seen = new Set(store.get('duploye.lessons.seen', []));
      seen.add(entry.id);
      store.set('duploye.lessons.seen', [...seen]);
    }
    article.classList.add('ready');
    syncNav(entry?.id, meta.lang === 'en' ? 'en' : 'fr');
    document.title = `${title} · Duployé Lessons`;
    if (!location.hash.startsWith('#s')) scrollTo({ top: 0, behavior: 'instant' });
  };

  if (firstShow) {
    firstShow = false;
    await window.__pageReveal; // arriving from the canvas: let that transition finish first
    await swap(false);
  } else if (document.startViewTransition && !reduceMotion.matches) {
    let vt;
    try { vt = document.startViewTransition({ update: () => swap(true), types: ['lesson'] }); }
    catch { vt = document.startViewTransition(() => swap(true)); } // browsers without transition types
    vt.ready.catch(() => {}); // a quick second click aborts the first transition; that is fine
    vt.finished.catch(() => {});
  } else {
    await swap(true);
  }
}

$('menuBtn').addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  $('menuBtn').setAttribute('aria-expanded', String(open));
});
addEventListener('hashchange', () => { if (!location.hash.startsWith('#s')) show(); });

(async () => {
  try {
    index = await (await fetch('lessons/index.json')).json();
  } catch (err) {
    article.innerHTML = '<p class="err">Could not load the list of lessons. Reload the page.</p>';
    return;
  }
  await ready('fr');
  show();
})();
