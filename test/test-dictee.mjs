// French numbers and lenient answer checking for the dictation page.
import { frenchNumber, frenchOrdinal, randomNumber } from '../src/numbers.js';
import { isRight } from '../src/check.js';

let fail = 0;
const eq = (got, want, what) => { if (got !== want) { fail++; console.log(`✗ ${what}: ${got} ≠ ${want}`); } };
const FR = {
  0: 'zéro', 1: 'un', 16: 'seize', 17: 'dix-sept', 20: 'vingt', 21: 'vingt et un', 22: 'vingt-deux', 31: 'trente et un',
  61: 'soixante et un', 70: 'soixante-dix', 71: 'soixante et onze', 77: 'soixante-dix-sept', 80: 'quatre-vingts',
  81: 'quatre-vingt-un', 90: 'quatre-vingt-dix', 91: 'quatre-vingt-onze', 99: 'quatre-vingt-dix-neuf', 100: 'cent',
  101: 'cent un', 180: 'cent quatre-vingts', 200: 'deux cents', 201: 'deux cent un', 347: 'trois cent quarante-sept',
  1000: 'mille', 1001: 'mille un', 1100: 'mille cent', 1980: 'mille neuf cent quatre-vingts', 2000: 'deux mille',
  2200: 'deux mille deux cents', 9999: 'neuf mille neuf cent quatre-vingt-dix-neuf',
};
for (const [n, w] of Object.entries(FR)) eq(frenchNumber(+n), w, n);
const ORD = { 1: 'premier, première', 2: 'deuxième', 3: 'troisième', 4: 'quatrième', 5: 'cinquième', 9: 'neuvième', 11: 'onzième',
  16: 'seizième', 21: 'vingt et unième', 30: 'trentième', 71: 'soixante et onzième', 80: 'quatre-vingtième', 81: 'quatre-vingt-unième',
  99: 'quatre-vingt-dix-neuvième', 100: 'centième', 101: 'cent unième', 200: 'deux centième', 1000: 'millième', 2000: 'deux millième',
  1001: 'mille unième', 3485: 'trois mille quatre cent quatre-vingt-cinquième' };
for (const [n, w] of Object.entries(ORD)) eq(frenchOrdinal(+n), w, `ordinal ${n}`);
for (let i = 0; i < 2000; i++) { const n = randomNumber(); if (!(n >= 0 && n <= 9999)) { fail++; console.log('✗ random', n); break; } }

const OK = [['Quatre vingt dix', 'quatre-vingt-dix'], ['quatre-vingt', 'quatre-vingts'], ['deux cent', 'deux cents'],
  ['ete', 'été'], ['grande', 'grand, grande'], ['grand', 'grand, grande'], ['livre', 'le livre'], ['l arbre', "l'arbre"],
  ['coeur', 'cœur'], [' rouge  gorge ', 'rouge-gorge'], ['Etroite', 'étroit, étroite'], ['premiere', 'premier, première'], ['vingt et unieme', 'vingt et unième']];
for (const [t, a] of OK) eq(isRight(t, a), true, `accept "${t}" for "${a}"`);
const NO = [['', 'été'], ['grands', 'grand, grande'], ['quatre vingt', 'quatre-vingt-dix'], ['le', 'le livre']];
for (const [t, a] of NO) eq(isRight(t, a), false, `reject "${t}" for "${a}"`);

console.log(fail ? `${fail} failed` : 'all dictation checks pass');
process.exit(fail ? 1 : 0);
