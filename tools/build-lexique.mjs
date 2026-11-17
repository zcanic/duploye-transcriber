// Builds data/lexique/*.tsv from Lexique 3.83 (New, Pallier, Brysbaert & Ferrand;
// http://www.lexique.org, CC BY-SA 4.0): one pronunciation per spelling, in Lexique's
// own phonetic code, sharded by the first three letters so the page loads only what it needs.
//
//   node tools/build-lexique.mjs path/to/Lexique383.tsv
//
// Each line: spelling <TAB> pronunciation [<TAB> pronunciation after ils/elles].
// Homographs keep their most frequent reading (est = [e]/[ɛ], not [ɛst]); when a
// 3rd-person-plural verb reads differently (couvent [kuv] vs [kuvɑ̃]), it is kept as
// the third column, used after a subject pronoun.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { shardKey } from '../src/lexicon.js';

const src = process.argv[2];
if (!src) { console.error('usage: node tools/build-lexique.mjs Lexique383.tsv'); process.exit(1); }
const rows = readFileSync(src, 'utf8').split('\n');
const head = rows.shift().split('\t');
const col = (n) => head.indexOf(n);
const [O, P, F1, F2, INF] = ['ortho', 'phon', 'freqfilms2', 'freqlivres', 'infover'].map(col);

const words = new Map(); // ortho -> Map(phon -> {f, plural})
for (const line of rows) {
  if (!line) continue;
  const c = line.split('\t');
  const ortho = c[O].normalize('NFC').toLowerCase();
  if (!/^[\p{L}'-]+$/u.test(ortho)) continue;
  const m = words.get(ortho) || new Map();
  const e = m.get(c[P]) || { f: 0, plural: false };
  e.f += (+c[F1] || 0) + (+c[F2] || 0) + 1e-6;
  if (/(^|;)(ind|sub|cnd):[a-z]+:3p/.test(c[INF])) e.plural = true;
  m.set(c[P], e);
  words.set(ortho, m);
}

const shards = new Map();
for (const [ortho, m] of [...words].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  const ranked = [...m].sort((a, b) => b[1].f - a[1].f);
  const best = ranked[0][0];
  const verb = ranked.find(([, e]) => e.plural)?.[0];
  const line = verb && verb !== best ? `${ortho}\t${best}\t${verb}` : `${ortho}\t${best}`;
  const k = shardKey(ortho);
  (shards.get(k) || shards.set(k, []).get(k)).push(line);
}

const out = new URL('../data/lexique/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith('.tsv')) rmSync(new URL(f, out)); // keep README.md
let bytes = 0;
for (const [k, lines] of shards) {
  const text = lines.join('\n') + '\n';
  bytes += Buffer.byteLength(text);
  writeFileSync(new URL(`${k}.tsv`, out), text);
}
console.log(`${words.size} spellings, ${shards.size} shards, ${(bytes / 1024).toFixed(0)} KB`);
