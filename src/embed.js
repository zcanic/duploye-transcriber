// <duploye-text> — shorthand you can put on any page.
//
//   <script type="module" src="https://zcanic.github.io/duploye-transcriber/src/embed.js"></script>
//   <duploye-text lang="fr">Un pour tous, tous pour un.</duploye-text>
//   <duploye-text lang="en" gloss size="48">Shorthand is fast.</duploye-text>
//
// Attributes
//   lang      "fr" (Duployé, default) or "en" (Sloan-Duployan)
//   gloss     show the words under the shorthand
//   nosigles  spell out abbreviations instead of using sigles / word signs
//   size      pen size in px per em (default 40)
//   width     wrap width in px (default: the width the element is given, else 640)
//   static    draw at once, without the writing animation
// Style the ink with CSS: duploye-text { color: …; --duploye-gloss: …; }
// Methods: el.replay() writes it again.
import { ready } from './runtime.js';
import { SYSTEMS } from './systems.js';
import { InkSheet, buildItems } from './sheet.js';

const NS = 'http://www.w3.org/2000/svg';
const CSS = `
:host { display: inline-block; vertical-align: middle; color: inherit; line-height: 0; max-width: 100%; }
svg { display: block; overflow: visible; max-width: 100%; height: auto; }
.g { fill: currentColor; }
.gloss { fill: var(--duploye-gloss, #7b8193); font: 12px ui-monospace, "SF Mono", Menlo, monospace; }
.ul { stroke: currentColor; stroke-width: 1.4; }
.hit { fill: transparent; }
.num { fill: currentColor; font: 500 22px ui-monospace, monospace; }
.sepmark { fill: var(--duploye-gloss, #7b8193); font: 18px system-ui, sans-serif; }
.word { transition: transform .45s cubic-bezier(.2,.8,.2,1), opacity .2s; }
.word.fresh { transition: none; }
.word.leaving { opacity: 0; }
`;

class DuployeText extends HTMLElement {
  static observedAttributes = ['lang', 'gloss', 'nosigles', 'size', 'width'];

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('role', 'img');
    this.g = document.createElementNS(NS, 'g');
    this.svg.append(this.g);
    root.append(style, this.svg);
    this.mo = new MutationObserver(() => this.render());
  }

  get lang() { return this.getAttribute('lang') === 'en' ? 'en' : 'fr'; }
  set lang(v) { this.setAttribute('lang', v); }

  connectedCallback() {
    this.mo.observe(this, { characterData: true, childList: true, subtree: true });
    this.firstInk = !this.hasAttribute('static');
    this.render();
  }
  disconnectedCallback() { this.mo.disconnect(); this.io?.disconnect(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }

  async render() {
    const lang = this.lang;
    const sys = SYSTEMS[lang];
    const text = this.textContent.trim();
    this.svg.setAttribute('aria-label', text);
    try { await ready(lang); } catch (err) { console.error('duploye-text:', err); return; }
    if (lang !== this.lang) return; // changed while loading
    const size = Number(this.getAttribute('size')) || 40;
    const width = () => Number(this.getAttribute('width')) || this.parentElement?.clientWidth || 640;
    if (!this.sheet || this.sheet.unit !== size / 1000) {
      this.g.replaceChildren();
      this.sheet = new InkSheet(this.g, { unit: size / 1000, width, gloss: () => this.hasAttribute('gloss'), maxInkMs: 4000 });
    }
    const items = buildItems(text, sys, { useSigles: !this.hasAttribute('nosigles') });
    const animate = this.firstInk && !this.hasAttribute('static');
    // after the first writing, edits ink only the words that changed
    const s = this.sheet.set(items, sys, { ink: !animate && !this.hasAttribute('static') && !!this.rendered });
    this.rendered = true;
    const pad = 6;
    const w = s.used + pad * 2, h = s.h + pad * 2;
    this.svg.setAttribute('viewBox', `${-pad} ${-pad} ${w} ${h}`);
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    if (animate) {
      this.firstInk = false;
      // hide until visible, then write it out
      for (const p of this.svg.querySelectorAll('.g')) p.style.visibility = 'hidden';
      this.io = new IntersectionObserver((es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        this.io.disconnect();
        for (const p of this.svg.querySelectorAll('.g')) p.style.visibility = '';
        this.sheet.replay();
      }, { rootMargin: '0px 0px -10% 0px' });
      this.io.observe(this);
    }
  }

  replay() { this.sheet?.replay(); }
}

if (!customElements.get('duploye-text')) customElements.define('duploye-text', DuployeText);
export { DuployeText };
