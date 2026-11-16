// English (Sloan-Duployan) checks. Words and sound spellings from
// The Sloan-Duployan Shorthand Instructor (1934), Exercises 1–5.
// Run: node test/test-en.mjs
import { readFileSync } from 'fs';
import { setDictionary, wordToTokens, transcribe } from '../src/english.js';

setDictionary(readFileSync(new URL('../data/cmudict-en.txt', import.meta.url), 'utf8'));

const CASES = {
  grow: 'G R ŏ', toe: 'T ŏ', up: 'ŭ P', view: 'V ū', ado: 'ă D oo', joke: 'J ŏ K', thought: 'TH ŏ T',
  probe: 'P R ŏ B', ova: 'ŏ V ă', crag: 'K R ă G', apt: 'ă P T', cough: 'K ŏ F', drove: 'D R ŏ V',
  droop: 'D R oo P', bravo: 'B R ă V ŏ', upper: 'ŭ P ĕ R', board: 'B ŏ R D', plough: 'P L ow',
  knew: 'N oo', fan: 'F ăn', enter: 'ĕn T ĕ R', print: 'P R ĭn T', fun: 'F ŭn',
  oil: 'oi L', owl: 'ow L', me: 'M ē', fate: 'F ā T', met: 'M ĕ T', it: 'ĭ T', church: 'CH ŭ R CH',
  judge: 'J ŭ J', sing: 'S ĭ NG', when: 'WH ĕn', yes: 'Y ĕ S', house: 'ow S',
  write: 'R ī T', knight: 'N ī T', name: 'N ā M', shorthand: 'SH ŏ R T ăn D', lathe: 'L ā DH', pith: 'P ĭ TH',
};
let fail = 0;
for (const [w, exp] of Object.entries(CASES)) {
  const got = wordToTokens(w).tokens.join(' ');
  if (got !== exp) { fail++; console.log(`✗ ${w.padEnd(10)} got: ${got.padEnd(18)} want: ${exp}`); }
}
console.log(`words: ${Object.keys(CASES).length - fail}/${Object.keys(CASES).length} pass`);
const s = transcribe('The cat and the dog. Zxqv went to Paris.');
console.log(s.map((sent) => sent.map((x) => `${x.text}[${x.tokens.join(' ')}]${x.sigle ? '*' : ''}${x.guessed ? '?' : ''}`).join(' ')).join('\n'));
process.exit(fail ? 1 : 0);
