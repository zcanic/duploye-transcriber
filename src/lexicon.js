// French pronunciations from Lexique 3.83 (http://www.lexique.org, CC BY-SA 4.0),
// loaded lazily: data/lexique/ holds one small file per three-letter prefix, and only
// the files for the words on screen are fetched. Words not in Lexique fall back to
// the spelling rules in g2p.js.
//
//   await loadWords(text)   // fetch what `text` needs (gives up quietly after a timeout)
//   lookup(word)            // -> {phon, plural?} or undefined, synchronous

const entries = new Map(); // spelling -> {phon, plural}
const shards = new Map();  // key -> Promise
let loader = (key) => fetch(new URL(`../data/lexique/${key}.tsv`, import.meta.url)).then((r) => (r.ok ? r.text() : ''));

/** Replace how shard files are read (tests read them from disk). */
export function setLoader(fn) { loader = fn; }

/** File name for a word: its first three letters without accents, `_` for anything else. */
export function shardKey(word) {
  const base = word.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace('œ', 'oe').replace('æ', 'ae');
  return (base.slice(0, 3).replace(/[^a-z]/g, '_') + '__').slice(0, 3);
}

const wordsOf = (text) => {
  const out = new Set();
  for (const w of text.normalize('NFC').replace(/’/g, "'").toLowerCase().match(/[\p{L}'-]+/gu) || []) {
    out.add(w);
    for (const p of w.split(/['-]/)) if (p) out.add(p);
  }
  return out;
};

function loadShard(key) {
  let p = shards.get(key);
  if (!p) {
    p = Promise.resolve().then(() => loader(key)).then((text) => {
      for (const line of text.split('\n')) {
        if (!line) continue;
        const [w, phon, plural] = line.split('\t');
        entries.set(w, plural ? { phon, plural } : { phon });
      }
    }).catch(() => shards.delete(key)); // offline: try again next time
    shards.set(key, p);
  }
  return p;
}

/** Fetch the pronunciations `text` needs. Resolves after `timeout` ms at the latest. */
export function loadWords(text, timeout = 2500) {
  const keys = new Set([...wordsOf(text)].map(shardKey));
  const all = Promise.all([...keys].map(loadShard));
  let timer;
  const late = new Promise((r) => { timer = setTimeout(r, timeout); });
  return Promise.race([all, late]).then(() => clearTimeout(timer));
}

export const lookup = (word) => entries.get(word.toLowerCase().normalize('NFC'));

// Lexique's phonetic code -> Duployé tokens.
const MAP = {
  a: 'a', i: 'i', e: 'é', E: 'è', o: 'o', O: 'ò', u: 'ou', y: 'u', 2: 'eu', 9: 'œ',
  '@': 'an', '§': 'on', 5: 'in', 1: 'un',
  p: 'P', b: 'B', t: 'T', d: 'D', k: 'K', g: 'G', f: 'F', v: 'V', s: 'S', z: 'Z',
  S: 'CH', Z: 'J', m: 'M', n: 'N', N: 'GN', l: 'L', R: 'R', x: 'R',
};

/**
 * Tokens for a Lexique pronunciation. The schwa (°) is not written, as in the manual;
 * the glides [j] [w] [ɥ] are written i, ou, u. With `oi`, [wa] is written a, and with `ui`,
 * [ɥi] is written i (the manual's shortcuts, for words spelled with oi / ui only).
 */
export function phonToTokens(phon, { oi = false, ui = false } = {}) {
  const out = [];
  for (let k = 0; k < phon.length; k++) {
    const c = phon[k], next = phon[k + 1];
    if (c === '°') continue;
    if (c === 'G') { out.push('N', 'G'); continue; } // parking
    if (c === 'j') { if (out[out.length - 1] !== 'i' && next !== 'i') out.push('i'); continue; } // fille, pays
    if (c === 'w') { if (!(oi && next === 'a')) out.push('ou'); continue; }
    if (c === '8') { if (!(ui && next === 'i')) out.push('u'); continue; }
    const t = MAP[c];
    if (t && !(c === phon[k - 1] && t === t.toUpperCase())) out.push(t); // villa: one l (but dedans keeps both d)
  }
  return out;
}
