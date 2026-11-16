// The lessons page: a list of notebooks (lessons/index.json) and the reader.
// Open a lesson with #fr-01, or any notebook on the web with ?src=<url of a .md file>.
import { renderNotebook } from './notebook.js';
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

function renderNav(currentId) {
  if (nav.childElementCount) nav.classList.add('settled'); // fade the list in once, not on every refresh
  const done = new Set(store.get('duploye.lessons.seen', []));
  const groups = [...new Set(index.map((l) => l.course))];
  nav.innerHTML = groups.map((course) => `<h2>${esc(course)}</h2><ol>${index.filter((l) => l.course === course).map((l) => l.soon
    ? `<li><a class="soon" aria-disabled="true"><span class="n">${esc(l.n)}</span><span>${esc(l.title)}</span><span>soon</span></a></li>`
    : `<li><a href="#${esc(l.id)}"${l.id === currentId ? ' aria-current="page"' : ''}><span class="n">${esc(l.n)}</span><span>${esc(l.title)}</span>${done.has(l.id) ? '<span class="done" aria-label="read">✓</span>' : ''}</a></li>`).join('')}</ol>`).join('');
  nav.append(alphabetCard(alphaLang));
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

async function show() {
  nav.classList.remove('open');
  $('menuBtn').setAttribute('aria-expanded', 'false');
  const params = new URLSearchParams(location.search);
  const external = params.get('src');
  const live = index.filter((l) => !l.soon);
  let entry = null, url;
  if (external) {
    url = external;
  } else {
    const id = decodeURIComponent(location.hash.slice(1)) || live[0]?.id;
    entry = live.find((l) => l.id === id) || live[0];
    url = `lessons/${entry.file}`;
  }
  renderNav(entry?.id);
  article.classList.remove('ready');
  article.innerHTML = '<p class="loading">Loading the lesson…</p>';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const md = await res.text();
    const { meta } = await renderNotebook(md, article);
    alphaLang = meta.lang === 'en' ? 'en' : 'fr';
    const title = meta.title || entry?.title || 'Notebook';
    const head = document.createElement('div');
    head.innerHTML = `${meta.kicker || entry ? `<p class="kicker">${esc(meta.kicker || `${entry.course} · ${entry.n}`)}</p>` : ''}<h1>${esc(title)}</h1>`;
    article.prepend(...head.childNodes);
    if (entry) {
      article.append(pager(live.indexOf(entry)));
      const seen = new Set(store.get('duploye.lessons.seen', []));
      seen.add(entry.id);
      store.set('duploye.lessons.seen', [...seen]);
      renderNav(entry.id);
    }
    article.classList.add('ready');
    if (!entry) renderNav(null); // refresh the alphabet card for the notebook's language
    document.title = `${title} · Duployé Lessons`;
    if (!location.hash.startsWith('#s')) scrollTo({ top: 0 });
  } catch (err) {
    console.error(err);
    article.innerHTML = `<p class="err">Could not load ${esc(url)} (${esc(err.message)}). Check the address, then reload.</p>`;
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
