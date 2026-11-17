// Lexique pronunciations (data/lexique/, built by tools/build-lexique.mjs) and how they
// become Duployé tokens. Run: node test/test-lexicon.mjs
import { readFileSync } from 'fs';
import { setLoader, loadWords, shardKey } from '../src/lexicon.js';
import { transcribe } from '../src/duploye.js';

setLoader((k) => { try { return readFileSync(new URL(`../data/lexique/${k}.tsv`, import.meta.url), 'utf8'); } catch { return ''; } });
const tok = (text, opts) => transcribe(text, opts).flat().map((i) => i.tokens.join(' ')).join(' | ');
const cases = [
  // [text, options, expected]
  ['grosse', {}, 'G R o S'],                       // closed o, which spelling rules miss
  ['aile', { accents: true }, 'è L'],
  ['dix-sept', { accents: true }, 'D i S | S è T'],
  ['aiguille', {}, 'é G u i'],                     // [egɥij], hyphen-free
  ['parking', {}, 'P a R K i N G'],
  ['ascenseur', { accents: true }, 'a S an S œ R'],
  ['adorer', { accents: true }, 'a D ò R é'],      // Lexique's unstressed [o] corrected to [ɔ]
  ['peur', { accents: true }, 'P œ R'],            // Lexique has [pøʀ]; rules decide eu quality
  ['dedans', {}, 'D D an'],                        // two d across the unwritten schwa
  ['villa', {}, 'V i L a'],                        // one l
  ['ce', {}, 'S'],                                 // schwa, not written
  ['premier', {}, 'P R M i é'],
  ['noua', { useSigles: true }, 'N ou a'],         // oi shortcut only for spelled oi
  ['loi', { useSigles: true }, 'L a'],
  ['loi', { useSigles: false }, 'L ou a'],
  ['huile', { useSigles: true }, 'i L'],
  ['ils couvent', { useSigles: false }, 'i L | K ou V'],   // verb after a subject pronoun
  ['le couvent', { useSigles: false }, 'L | K ou V an'],
  ['zoo', {}, 'Z o'],
  ['xyzzyq', {}, 'K S i Z i K'],                   // not in Lexique: spelling rules
];
let fail = 0;
await loadWords(cases.map((c) => c[0]).join(' '), 10000);
for (const [text, opts, want] of cases) {
  const got = tok(text, { useSigles: false, accents: false, ...opts });
  if (got !== want) { fail++; console.log(`✗ ${text}: ${got}  (want ${want})`); }
}
if (shardKey('Œuvre') !== 'oeu' || shardKey('à') !== 'a__' || shardKey("l'été") !== 'l_e') { fail++; console.log('✗ shardKey'); }
console.log(fail ? `lexicon: ${fail} failed` : `lexicon: all ${cases.length} pass`);
process.exit(fail ? 1 : 0);
