// HarfBuzz shaping of Duployan text into positioned glyph outlines.
//
// Shaping happens in a worker (src/shape-worker.js) so the main thread never
// stalls: call `await prefetch(texts)` before drawing, then `shape(text)` reads
// the cached result synchronously. If workers are unavailable, or a text was not
// prefetched, shaping falls back to the main thread.
import { makeShaper } from './shape-core.js';

const cache = new Map();     // text -> {glyphs, box}
const inflight = new Map();  // text -> Promise
let fontUrl = null;
let worker = null, workerReady = null, seq = 0;
const waiting = new Map();   // message id -> resolve
let mainShaper = null, mainShaperPromise = null;

export async function loadFont(url) {
  fontUrl = url;
  if (typeof Worker === 'function' && !worker) {
    try {
      worker = new Worker(new URL('./shape-worker.js', import.meta.url), { type: 'module' });
      workerReady = new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'ready') resolve();
          else if (m.type === 'error') reject(new Error(m.message));
          else if (m.type === 'shaped') {
            for (const [t, r] of m.out) cache.set(t, r);
            waiting.get(m.id)?.();
            waiting.delete(m.id);
          }
        };
        worker.onerror = (err) => reject(err);
      });
      worker.postMessage({ type: 'init', url });
      // never hang: if the worker does not come up, shape on the main thread instead
      await Promise.race([workerReady, new Promise((_, reject) => setTimeout(() => reject(new Error('worker timeout')), 8000))]);
      return;
    } catch (err) {
      console.warn('Shaping worker unavailable, shaping on the main thread.', err);
      worker?.terminate();
      worker = null;
    }
  }
  await ensureMainShaper();
}

function ensureMainShaper() {
  mainShaperPromise ||= (async () => {
    const hb = await import('../vendor/harfbuzzjs/index.mjs');
    const buf = await (await fetch(fontUrl)).arrayBuffer();
    const face = new hb.Face(new hb.Blob(buf));
    mainShaper = makeShaper(hb, new hb.Font(face));
  })();
  return mainShaperPromise;
}

/** Shape these texts in the background; resolves once all are cached. */
export function prefetch(texts) {
  const want = [...new Set(texts)].filter((t) => typeof t === 'string');
  const missing = want.filter((t) => !cache.has(t) && !inflight.has(t));
  if (missing.length) {
    let p;
    if (worker) {
      const id = ++seq;
      p = new Promise((resolve) => waiting.set(id, resolve));
      worker.postMessage({ type: 'shape', id, texts: missing });
    } else {
      p = ensureMainShaper().then(() => { for (const t of missing) cache.set(t, mainShaper(t)); });
    }
    for (const t of missing) inflight.set(t, p.finally(() => inflight.delete(t)));
  }
  return Promise.all(want.map((t) => inflight.get(t)).filter(Boolean)).then(() => {});
}

/**
 * Shape a Duployan string. Returns glyphs in writing order, in font units
 * (1000 per em, y pointing up), with the pen starting at (0, 0).
 * @returns {{glyphs: {d:string,x:number,y:number,box:object,len:number}[], box: object}}
 */
export function shape(text) {
  const hit = cache.get(text);
  if (hit) return hit;
  if (!mainShaper) throw new Error(`"${text}" was not prefetched; call prefetch() before drawing.`);
  const r = mainShaper(text);
  cache.set(text, r);
  return r;
}
