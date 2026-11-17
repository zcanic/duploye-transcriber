// Every word must shape into one clean outline: no dotted circles (U+25CC), which the
// font inserts for sequences it cannot join. Covers the built-in vocabulary (French,
// with and without the house-rule accents and shortcuts) and a slice of English.
// Run: node test/test-render.mjs
import { readFileSync } from 'fs';
import * as hb from '../vendor/harfbuzzjs/index.mjs';
import { transcribe as fr } from '../src/duploye.js';
import { transcribe as en, setDictionary, toDuployan as enDuployan } from '../src/english.js';
import { toDuployan as frDuployan } from '../src/duploye.js';
import { makeShaper } from '../src/shape-core.js';
import { setLoader, loadWords } from '../src/lexicon.js';

const b = readFileSync(new URL('../fonts/NotoSansDuployan-Regular.ttf', import.meta.url));
const font = new hb.Font(new hb.Face(new hb.Blob(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))));
const dotted = font.nominalGlyph(0x25cc);
const shape = makeShaper(hb, font);
const hasDotted = (text) => {
  const B = new hb.Buffer(); B.addText(text.replace(/\u0300/g, '')); B.guessSegmentProperties(); hb.shape(font, B);
  return B.getGlyphInfosAndPositions().some((g) => g.codepoint === dotted);
};

let fail = 0, n = 0;
const check = (label, items, toDuployan) => {
  for (const it of items.flat()) {
    if (!it.tokens?.length) continue;
    const t = toDuployan(it.tokens);
    n++;
    if (hasDotted(t)) { fail++; if (fail <= 20) console.log(`✗ ${label} ${it.text} [${it.tokens.join(' ')}]`); continue; }
    const s = shape(t);
    if (it.tokens.some((k) => /^[èòœ]$/.test(k)) && !s.glyphs.some((g) => g.mark)) { fail++; console.log(`✗ ${label} ${it.text}: open vowel without accent`); }
  }
};

const vocab = JSON.parse(readFileSync(new URL('../data/vocab-fr.json', import.meta.url), 'utf8'));
const words = vocab.topics.flatMap((t) => t.cards.map((c) => c[0].replace(/,/g, ' ')));
// French as the page writes it: with Lexique's pronunciations loaded
setLoader((k) => { try { return readFileSync(new URL(`../data/lexique/${k}.tsv`, import.meta.url), 'utf8'); } catch { return ''; } });
await loadWords(words.join(' '), 60000);
for (const opts of [{ useSigles: false, accents: true }, { useSigles: true, accents: false }]) {
  for (const w of words) check(`fr ${JSON.stringify(opts)}`, fr(w, opts), frDuployan);
}
setDictionary(readFileSync(new URL('../data/cmudict-en.txt', import.meta.url), 'utf8'));
const dict = readFileSync(new URL('../data/cmudict-en.txt', import.meta.url), 'utf8').split('\n');
for (let i = 0; i < dict.length; i += 60) { const w = dict[i].split('\t')[0]; if (w) check('en', en(w, { useSigles: false }), enDuployan); }
console.log(fail ? `render: ${fail} problems in ${n} words` : `render: ${n} words, all clean`);
process.exit(fail ? 1 : 0);
