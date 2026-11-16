// English in Sloan-Duployan shorthand (J. M. Sloan, 1882), the most widespread
// English adaptation of Duployé. Sounds come from the CMU Pronouncing
// Dictionary; words it lacks are guessed from spelling.
//
// Signs follow the "Complete Shorthand Alphabet" of The Sloan-Duployan
// Shorthand Instructor (1934), mapped to the Unicode Duployan block. Two
// mappings are approximate because Unicode has no exact code point:
//   - y is written with the i hook;
//   - the five small-quadrant nasals (ăn ĕn ĭn ŏn ŭn) use the nasal and
//     Sloan nasal letters with the closest shape and marks.

// Token -> code points (some signs are two letters, e.g. ī = small circle + hook).
export const CODEPOINTS = {
  P: [0x1bc02], B: [0x1bc07], T: [0x1bc03], D: [0x1bc08], K: [0x1bc05], G: [0x1bc0a],
  F: [0x1bc04], V: [0x1bc09], L: [0x1bc06], R: [0x1bc0b], J: [0x1bc15], // J: Sloan J, extended k-slant
  TH: [0x1bc11], DH: [0x1bc12], M: [0x1bc19], N: [0x1bc1a], NG: [0x1bc28],
  S: [0x1bc1c], Z: [0x1bc25], SH: [0x1bc1b], ZH: [0x1bc23], CH: [0x1bc29],
  W: [0x1bc38], WH: [0x1bc39], Y: [0x1bc46],
  'ă': [0x1bc41], 'ŏ': [0x1bc44], 'ŭ': [0x1bc57], oo: [0x1bc59], 'ū': [0x1bc58],
  'ĭ': [0x1bc46], 'ĕ': [0x1bc4c], 'ā': [0x1bc47], 'ē': [0x1bc4e],
  ow: [0x1bc42], 'ī': [0x1bc41, 0x1bc46], oi: [0x1bc44, 0x1bc46],
  'ăn': [0x1bc61], 'ĕn': [0x1bc67], 'ĭn': [0x1bc68], 'ŏn': [0x1bc64], 'ŭn': [0x1bc69],
};
export const TOKENS = Object.keys(CODEPOINTS);

export const GROUPS = [
  ['Lines', ['P', 'B', 'T', 'D', 'TH', 'DH', 'F', 'V', 'K', 'G', 'J', 'L', 'R']],
  ['Curves', ['M', 'N', 'NG', 'S', 'Z', 'SH', 'ZH', 'CH', 'W', 'WH', 'Y']],
  ['Vowels', ['ă', 'ŏ', 'ŭ', 'oo', 'ū', 'ĭ', 'ĕ', 'ā', 'ē', 'ow', 'ī', 'oi']],
  ['Nasals', ['ăn', 'ĕn', 'ĭn', 'ŏn', 'ŭn']],
];
export const HINTS = {
  'ă': 'fat, far', 'ŏ': 'not, fall, note', 'ŭ': 'nut', oo: 'bull, move', 'ū': 'tube', 'ĭ': 'it', 'ĕ': 'met', 'ā': 'fate',
  'ē': 'me', ow: 'owl', 'ī': 'iron', oi: 'oil', TH: 'pith', DH: 'lathe', SH: 'she', ZH: 'vision', CH: 'church',
  J: 'judge', NG: 'sing', WH: 'when', 'ăn': 'fan', 'ĕn': 'enter', 'ĭn': 'print', 'ŏn': 'gone', 'ŭn': 'fun',
};

// Word signs from Unit 9 of the Instructor.
export const SIGLES = {
  put: ['P'], people: ['P'], be: ['B'], but: ['B'], by: ['B'], on: ['K'], could: ['K'], quite: ['K'],
  go: ['G'], ago: ['G'], good: ['G'], in: ['F'], full: ['F'], have: ['V'], very: ['V'],
  the: ['T'], to: ['T'], and: ['D'], do: ['D'], of: ['ŏ'], all: ['ŏ'], ought: ['ŏ'], i: ['ă'], a: ['ă'], an: ['ă'],
};

// ---------- dictionary ----------
const PHONES = ['AA', 'AE', 'AH', 'AX', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
  'B', 'CH', 'D', 'DH', 'F', 'G', 'HH', 'JH', 'K', 'L', 'M', 'N', 'NG', 'P', 'R', 'S', 'SH', 'T', 'TH', 'V', 'W', 'Y', 'Z', 'ZH'];
const CODE = 'abcdefghijklmnopBCDEFGHIJKLMNPQRSTUVWXYZ';
const DECODE = Object.fromEntries([...CODE].map((c, i) => [c, PHONES[i]]));
// The dictionary stays one sorted string; words are found by binary search over
// its lines. Nothing is parsed up front, so loading 125,000 words costs no main-thread time.
let dict = null;

export async function loadDictionary(url) {
  if (dict) return;
  dict = await (await fetch(url)).text();
}
export const dictionaryReady = () => !!dict;
export const setDictionary = (text) => { dict = text; }; // for tests

function lookup(word) {
  if (!dict) return undefined;
  let lo = 0, hi = dict.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const start = dict.lastIndexOf('\n', mid - 1) + 1; // start of the line holding mid
    const tab = dict.indexOf('\t', start);
    let end = dict.indexOf('\n', start);
    if (end < 0) end = dict.length;
    if (tab < 0 || tab > end) { hi = start; continue; }
    const w = dict.slice(start, tab);
    if (w === word) return dict.slice(tab + 1, end);
    if (w < word) lo = end + 1; else hi = start;
  }
  return undefined;
}

// ---------- phones -> Sloan signs ----------
const SPELL_VOWEL = { a: 'ă', e: 'ĕ', i: 'ĭ', y: 'ĭ', o: 'ŏ', u: 'ŭ' };
const VOWEL_PHONES = new Set(['AA', 'AE', 'AH', 'AX', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW']);
const SIMPLE = { B: 'B', D: 'D', F: 'F', G: 'G', K: 'K', L: 'L', M: 'M', N: 'N', P: 'P', R: 'R', S: 'S', T: 'T', V: 'V', W: 'W', Z: 'Z',
  CH: 'CH', DH: 'DH', JH: 'J', NG: 'NG', SH: 'SH', TH: 'TH', ZH: 'ZH', Y: 'Y' };
const NASAL = { 'ă': 'ăn', 'ĕ': 'ĕn', 'ĭ': 'ĭn', 'ŏ': 'ŏn', 'ŭ': 'ŭn' };
const VOWEL_TOKENS = new Set(['ă', 'ŏ', 'ŭ', 'oo', 'ū', 'ĭ', 'ĕ', 'ā', 'ē', 'ow', 'ī', 'oi', 'ăn', 'ĕn', 'ĭn', 'ŏn', 'ŭn']);

// Sloan writes unstressed vowels after their spelling (ado = ă-d-oo, upper = uh-p-ĕr).
// Line up the vowel letter groups of the word with its vowel phones; when the
// counts match, an unstressed vowel takes the sign of its letter.
function spellingVowels(word) {
  const groups = word.toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) || [];
  return groups.map((g) => SPELL_VOWEL[g[0]] || 'ă');
}

export function phonesToTokens(phones, word = '') {
  const spelled = spellingVowels(word);
  const vowelCount = phones.filter((p) => VOWEL_PHONES.has(p)).length;
  const aligned = spelled.length === vowelCount;
  const out = [];
  let vi = -1;
  phones.forEach((p, i) => {
    const next = phones[i + 1];
    if (VOWEL_PHONES.has(p)) {
      vi++;
      const spell = aligned ? spelled[vi] : null;
      switch (p) {
        case 'AA': out.push(next === 'R' || spell === 'ă' ? 'ă' : 'ŏ'); break; // far, father, bravo / not, cot
        case 'AE': out.push('ă'); break;
        case 'AH': out.push('ŭ'); break;
        case 'AX': out.push(spell || 'ă'); break;
        case 'AO': out.push('ŏ'); break;
        case 'AW': out.push('ow'); break;
        case 'AY': out.push('ī'); break;
        case 'EH': out.push('ĕ'); break;
        case 'ER': out.push(spell && spell !== 'ŭ' ? spell : 'ŭ', 'R'); break;
        case 'EY': out.push('ā'); break;
        case 'IH': out.push('ĭ'); break;
        case 'IY': out.push('ē'); break;
        case 'OW': out.push('ŏ'); break;
        case 'OY': out.push('oi'); break;
        case 'UH': out.push('oo'); break;
        case 'UW': if (out[out.length - 1] === 'Y') out[out.length - 1] = 'ū'; else out.push('oo'); break;
      }
      return;
    }
    if (p === 'HH') return; // the aspirate is usually omitted
    if (p === 'W' && i === 0 && /^wh/i.test(word)) { out.push('WH'); return; }
    out.push(SIMPLE[p]);
  });
  // small-quadrant nasals: short vowel + n before a consonant or at the end (fan, enter, print, gone, fun)
  const res = [];
  for (let i = 0; i < out.length; i++) {
    const t = out[i], n = out[i + 1], after = out[i + 2];
    if (NASAL[t] && n === 'N' && (after === undefined || !VOWEL_TOKENS.has(after))) { res.push(NASAL[t]); i++; continue; }
    res.push(t);
  }
  return res;
}

// Rough spelling rules for words the dictionary lacks.
export function guessTokens(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length > 2 && w.endsWith('e') && !/[aeiou]e$/.test(w)) w = w.slice(0, -1);
  const out = [];
  const isV = (c) => c && 'aeiouy'.includes(c);
  for (let i = 0; i < w.length;) {
    const r = w.slice(i), c = w[i];
    const take = (n, ...t) => { out.push(...t); i += n; };
    if (r.startsWith('tch')) take(3, 'CH');
    else if (r.startsWith('th')) take(2, 'TH');
    else if (r.startsWith('sh')) take(2, 'SH');
    else if (r.startsWith('ch')) take(2, 'CH');
    else if (r.startsWith('ph')) take(2, 'F');
    else if (r.startsWith('wh')) take(2, 'WH');
    else if (r.startsWith('ng')) take(2, 'NG');
    else if (r.startsWith('ck')) take(2, 'K');
    else if (r.startsWith('qu')) take(2, 'K', 'W');
    else if (/^(ee|ea|ie)/.test(r)) take(2, 'ē');
    else if (/^(oo)/.test(r)) take(2, 'oo');
    else if (/^(ou|ow)/.test(r)) take(2, 'ow');
    else if (/^(ai|ay|ei|ey)/.test(r)) take(2, 'ā');
    else if (/^(oa|oe)/.test(r)) take(2, 'ŏ');
    else if (/^(oi|oy)/.test(r)) take(2, 'oi');
    else if (/^(au|aw)/.test(r)) take(2, 'ŏ');
    else if (c === 'y' && i === 0 && isV(w[1])) take(1, 'Y');
    else if (isV(c)) take(1, SPELL_VOWEL[c]);
    else if (c === 'c') take(1, 'eiy'.includes(w[i + 1] || '#') ? 'S' : 'K');
    else if (c === 'g') take(1, 'eiy'.includes(w[i + 1] || '#') ? 'J' : 'G');
    else if (c === 'x') take(1, 'K', 'S');
    else if (c === 'h') take(1);
    else if (c === 'j') take(1, 'J');
    else if (c === 'q') take(1, 'K');
    else take(w[i + 1] === c ? 2 : 1, c.toUpperCase());
  }
  return out.filter((t) => TOKENS.includes(t));
}

export function wordToTokens(word) {
  const key = word.toLowerCase().replace(/’/g, "'");
  const code = lookup(key) ?? lookup(key.replace(/'s$/, ''));
  if (!code) return { tokens: guessTokens(word), guessed: true };
  const phones = [...code].map((c) => DECODE[c]);
  if (key.endsWith("'s") && !lookup(key)) phones.push(/[ptkf]$/i.test(key.slice(0, -2)) ? 'S' : 'Z');
  return { tokens: phonesToTokens(phones, key), guessed: false };
}

export const toDuployan = (tokens) => tokens.map((t) => String.fromCodePoint(...(CODEPOINTS[t] || []))).join('');

export function transcribe(text, { useSigles = true } = {}) {
  const sentences = [];
  for (const part of text.normalize('NFC').replace(/’/g, "'").split(/(?<=[.!?;:])\s+|\n+/)) {
    const words = part.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g) || [];
    const items = [];
    words.forEach((word, idx) => {
      if (/^\d+$/.test(word)) { items.push({ text: word, tokens: [], number: true }); return; }
      const lower = word.toLowerCase();
      if (useSigles && SIGLES[lower]) { items.push({ text: word, tokens: SIGLES[lower], sigle: true }); return; }
      const { tokens, guessed } = wordToTokens(word);
      items.push({ text: word, tokens, guessed, properNoun: /^[A-Z]/.test(word) && idx > 0 && word !== 'I' });
    });
    if (items.length) sentences.push(items);
  }
  return sentences;
}
