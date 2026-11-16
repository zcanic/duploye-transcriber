// Shared loading: the shaping font once per page, and the writing system's data.
// Paths resolve from this module, so pages and embeds can live anywhere.
import { loadFont } from './shaper.js';
import { SYSTEMS } from './systems.js';

let fontPromise = null;

export function ready(lang = 'fr') {
  const sys = SYSTEMS[lang];
  if (!sys) return Promise.reject(new Error(`Unknown language "${lang}". Use "fr" or "en".`));
  fontPromise ||= loadFont(new URL('../fonts/NotoSansDuployan-Regular.ttf', import.meta.url).href);
  return Promise.all([fontPromise, sys.ready()]).then(() => sys);
}
