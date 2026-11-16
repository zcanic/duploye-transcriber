// The wordmark opens a small drawer of links: the site's pages, the embed
// component and the source. Shared by every page.
const REPO = 'https://github.com/zcanic/duploye-transcriber';
const LINKS = [
  [
    ['./', 'Canvas', 'Write any text in shorthand'],
    ['learn.html', 'Lessons', 'Six lessons, from the alphabet up'],
    ['cards.html', 'Cards', 'Vocabulary flashcards'],
  ],
  [
    ['embed.html', 'Embed', 'Shorthand on your own page'],
    [REPO, 'Source on GitHub', 'MIT licence', true],
    [`${REPO}/issues`, 'Report a mistake', 'A word written wrong, a bug', true],
  ],
];

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
  menu.innerHTML = LINKS.map((group) => `<div class="site-menu-group">${group.map(([href, label, note, ext]) =>
    `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}${here(href) ? ' aria-current="page"' : ''}><span>${esc(label)}${ext ? ' <i aria-hidden="true">↗</i>' : ''}</span><small>${esc(note)}</small></a>`).join('')}</div>`).join('');
  document.body.append(menu);

  const place = () => {
    const r = mark.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.left - 8, innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${r.bottom + 10}px`;
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
