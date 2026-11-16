// Shaping off the main thread. Noto Sans Duployan has very rich joining rules:
// shaping one word costs 10–30 ms, which would freeze page transitions and
// animations if done on the main thread.
//
// The message handler is installed first, and HarfBuzz is imported dynamically:
// harfbuzzjs uses top-level await, and messages that arrive while a module is
// still evaluating would otherwise be lost.
import { makeShaper } from './shape-core.js';

let shapeText = null;
let ready = null;

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    ready ||= (async () => {
      const [hb, buf] = await Promise.all([
        import('../vendor/harfbuzzjs/index.mjs'),
        fetch(msg.url).then((r) => r.arrayBuffer()),
      ]);
      shapeText = makeShaper(hb, new hb.Font(new hb.Face(new hb.Blob(buf))));
    })();
    try { await ready; self.postMessage({ type: 'ready' }); }
    catch (err) { self.postMessage({ type: 'error', message: String(err) }); }
    return;
  }
  if (msg.type === 'shape') {
    await ready;
    const out = msg.texts.map((t) => [t, shapeText(t)]);
    self.postMessage({ type: 'shaped', id: msg.id, out });
  }
};
