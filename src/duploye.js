// Phoneme tokens -> Unicode Duployan letters, plus sentence-level rules.
import { wordToPhonemes, TOKENS } from './g2p.js';

// Unicode 7.0 Duployan block (U+1BC00–1BC9F).
export const CODEPOINTS = {
  P: 0x1bc02, T: 0x1bc03, F: 0x1bc04, K: 0x1bc05, L: 0x1bc06,
  B: 0x1bc07, D: 0x1bc08, V: 0x1bc09, G: 0x1bc0a, R: 0x1bc0b,
  M: 0x1bc19, N: 0x1bc1a, J: 0x1bc1b, S: 0x1bc1c,
  GN: 0x1bc22, // N WITH DOT
  CH: 0x1bc23, // J WITH DOT
  Z: 0x1bc25, // S WITH DOT
  a: 0x1bc41, o: 0x1bc44, ou: 0x1bc5b, i: 0x1bc46, 'é': 0x1bc47, u: 0x1bc51, eu: 0x1bc52,
  an: 0x1bc64, in: 0x1bc63, on: 0x1bc62, un: 0x1bc61,
};

// Arbitrary abbreviations ("sigles") taught on p.3 of Sténographie intégrale.
// Each is written with a single letter of the alphabet.
export const SIGLES = {
  grand: ['G'], grande: ['G'], grands: ['G'], grandes: ['G'],
  pour: ['P'], bien: ['B'], faire: ['F'], vous: ['V'],
  tout: ['T'], tous: ['T'], toute: ['T'], toutes: ['T'],
  monsieur: ['M'], nous: ['N'], il: ['i'],
};

const ELIDED = { c: ['S'], d: ['D'], j: ['J'], l: ['L'], m: ['M'], n: ['N'], s: ['S'], t: ['T'], qu: ['K'], jusqu: ['J', 'u', 'S', 'K'], lorsqu: ['L', 'o', 'R', 'S', 'K'], puisqu: ['P', 'i', 'S', 'K'] };
const SUBJECT_PRONOUNS = new Set(['ils', 'elles', "qu'ils", "qu'elles"]);
const CIRCLE_VOWELS = new Set(['a', 'o', 'ou']);
const VOWEL_SET = new Set(['a', 'o', 'ou', 'é', 'i', 'u', 'eu', 'an', 'in', 'on', 'un']);

export const toDuployan = (tokens) => tokens.map((t) => String.fromCodePoint(CODEPOINTS[t])).join('');

export function parsePhonemes(text) {
  const toks = text.trim().split(/\s+/).filter(Boolean);
  const bad = toks.filter((t) => !TOKENS.includes(t));
  return { tokens: toks.filter((t) => TOKENS.includes(t)), bad };
}

// Split text into sentences of word items.
// Each item: { text, tokens, sigle, properNoun, joinToNext }
export function transcribe(text, { useSigles = true } = {}) {
  const sentences = [];
  const parts = text.normalize('NFC').replace(/’/g, "'").split(/(?<=[.!?;:])\s+|\n+/);
  for (const part of parts) {
    const words = part.match(/[\p{L}'-]+|\d+/gu) || [];
    const items = [];
    let prevWord = '';
    words.forEach((word, idx) => {
      if (/^\d+$/.test(word)) {
        items.push({ text: word, tokens: [], number: true });
        prevWord = word;
        return;
      }
      for (const piece of word.split('-').filter(Boolean)) {
        const m = piece.match(/^(c|d|j|l|m|n|s|t|qu|jusqu|lorsqu|puisqu)'(.+)$/i);
        if (m) {
          items.push({ text: m[1] + "'", tokens: ELIDED[m[1].toLowerCase()], elided: true });
          pushWord(items, m[2], prevWord, idx, useSigles);
        } else {
          pushWord(items, piece, prevWord, idx, useSigles);
        }
        prevWord = piece.toLowerCase();
      }
    });
    // Elision rule (p.11): the elided letter joins the next word if that word is
    // a monosyllable or starts with a circle vowel (a, o, ou); otherwise it stands apart.
    items.forEach((it, k) => {
      if (!it.elided) return;
      const next = items[k + 1];
      if (!next) return;
      const vowels = next.tokens.filter((t) => VOWEL_SET.has(t)).length;
      it.joinToNext = next.sigle || vowels <= 1 || CIRCLE_VOWELS.has(next.tokens[0]);
    });
    if (items.length) sentences.push(items);
  }
  return sentences;
}

function pushWord(items, word, prevWord, idx, useSigles) {
  const lower = word.toLowerCase();
  const isCap = /^\p{Lu}/u.test(word) && idx > 0 && lower !== 'monsieur';
  if (useSigles && SIGLES[lower]) {
    items.push({ text: word, tokens: SIGLES[lower], sigle: true });
    return;
  }
  const tokens = wordToPhonemes(word, { afterSubjectPronoun: SUBJECT_PRONOUNS.has(prevWord), shortcuts: useSigles });
  items.push({ text: word, tokens, properNoun: isCap });
}
