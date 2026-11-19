// The wordmark opens a small drawer of links: the site's pages, the embed
// component and the source, and the light/dark switch. Shared by every page.
const REPO = 'https://github.com/zcanic/duploye-transcriber';
const LINKS = [
  [
    ['./', 'Canvas', 'Write any text in shorthand'],
    ['learn.html', 'Lessons', 'Six lessons, from the alphabet up'],
    ['cards.html', 'Cards', 'Vocabulary flashcards'],
    ['dictee.html', 'Dictée', 'Read the shorthand, type the French'],
  ],
  [
    ['embed.html', 'Embed', 'Shorthand on your own page'],
    [REPO, 'Source on GitHub', 'MIT licence', true],
    [`${REPO}/issues`, 'Report a mistake', 'A word written wrong, a bug', true],
  ],
];

// ---------- theme: follow the system, or pinned light / dark ----------
// Each page's <head> applies the saved choice before first paint; this keeps
// the browser's theme-color in step and offers the switch.
const THEME_KEY = 'duploye.theme';
const THEMES = [
  ['auto', 'Match system', '<circle cx="10" cy="10" r="6"/><path d="M10 4a6 6 0 0 1 0 12z" fill="currentColor"/>'],
  ['light', 'Light', '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.8v1.6M10 15.6v1.6M2.8 10h1.6M15.6 10h1.6M4.9 4.9l1.1 1.1M14 14l1.1 1.1M4.9 15.1 6 14M14 6l1.1-1.1"/>'],
  ['dark', 'Dark', '<path d="M15.6 12.4A6.2 6.2 0 0 1 7.6 4.4a6.2 6.2 0 1 0 8 8z"/>'],
];
const savedTheme = () => { try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; } };
const syncThemeColor = () => {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || meta.content;
};
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
  syncThemeColor();
}
applyTheme(savedTheme());
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);

const mark = document.querySelector('button.mark');
if (mark) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const here = (href) => {
    const page = location.pathname.split('/').pop() || 'index.html';
    return (href === './' && (page === '' || page === 'index.html')) || href === page;
  };
  const menu = document.createElement('nav');
  menu.id = 'siteMenu';
  menu.className = 'site-menu';
  menu.setAttribute('aria-label', 'Duployé');
  menu.hidden = true;
  const themeRow = `<div class="site-menu-group site-menu-theme"><span>Appearance</span><div class="site-theme" role="group" aria-label="Appearance">${THEMES.map(([id, label, icon]) =>
    `<button type="button" data-theme-choice="${id}" aria-pressed="false" aria-label="${label}" title="${label}"><svg viewBox="0 0 20 20" aria-hidden="true">${icon}</svg></button>`).join('')}</div></div>`;
  menu.innerHTML = LINKS.map((group) => `<div class="site-menu-group">${group.map(([href, label, note, ext]) =>
    `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}${here(href) ? ' aria-current="page"' : ''}><span>${esc(label)}${ext ? ' <i aria-hidden="true">↗</i>' : ''}</span><small>${esc(note)}</small></a>`).join('')}</div>`).join('') + themeRow;
  document.body.append(menu);
  const pressTheme = (t) => { for (const b of menu.querySelectorAll('[data-theme-choice]')) b.setAttribute('aria-pressed', String(b.dataset.themeChoice === t)); };
  pressTheme(savedTheme());
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-choice]');
    if (!b) return;
    const t = b.dataset.themeChoice;
    try { if (t === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch { /* storage unavailable */ }
    pressTheme(t);
    // cross-fade the whole page into the new colours where the browser can
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(() => applyTheme(t));
      setTimeout(() => applyTheme(t), 400); // in case the transition never gets a frame
    } else applyTheme(t);
  });

  // Open below the whole bar or header that holds the wordmark (never over it),
  // with the link text lined up under the wordmark, inside the page gutter.
  const host = mark.closest('header, .float') || mark;
  // measures the phone's side safe areas: left offset = left inset, width = right inset
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;top:0;height:0;visibility:hidden;pointer-events:none;left:env(safe-area-inset-left,0px);width:env(safe-area-inset-right,0px)';
  document.body.append(probe);
  const place = () => {
    const h = host.getBoundingClientRect(), r = mark.getBoundingClientRect();
    // share an edge: with the floating toolbar on the canvas, with the wordmark under a page header
    const edge = host.classList.contains('float') ? h.left : r.left;
    const minLeft = probe.offsetLeft, maxLeft = innerWidth - menu.offsetWidth - Math.max(16, probe.offsetWidth);
    menu.style.left = `${Math.round(Math.max(minLeft, Math.min(edge, maxLeft)))}px`;
    menu.style.top = `${Math.round(h.bottom + 8)}px`;
  };
  const isOpen = () => !menu.hidden && !menu.classList.contains('closing');
  const open = () => {
    menu.classList.remove('closing');
    menu.hidden = false;
    place();
    mark.setAttribute('aria-expanded', 'true');
  };
  const close = (focusMark = false) => {
    if (!isOpen()) return;
    mark.setAttribute('aria-expanded', 'false');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { menu.hidden = true; }
    else {
      menu.classList.add('closing');
      const done = () => { if (menu.classList.contains('closing')) { menu.hidden = true; menu.classList.remove('closing'); } };
      menu.addEventListener('animationend', done, { once: true });
      setTimeout(done, 220); // in case the animation never runs
    }
    if (focusMark) mark.focus();
  };

  mark.addEventListener('click', (e) => { e.stopPropagation(); if (isOpen()) close(); else open(); });
  // the canvas pans on pointer events; keep a press on the wordmark from starting a pan
  mark.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.addEventListener('pointerdown', (e) => { if (isOpen() && !menu.contains(e.target) && !mark.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); close(true); } }, true);
  addEventListener('resize', () => { if (isOpen()) place(); });
  addEventListener('scroll', () => { if (isOpen()) place(); }, { passive: true });
}
