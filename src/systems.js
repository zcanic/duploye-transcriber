// The two writing systems the page offers, behind one interface.
import * as fr from './duploye.js';
import { TOKENS as FR_TOKENS } from './g2p.js';
import * as en from './english.js';

export const SYSTEMS = {
  fr: {
    id: 'fr',
    name: 'Duployé (French)',
    placeholder: 'Écrivez en français…',
    sample: "La loi donne à l'avocat l'arme qu'il faut pour chaque cas. Lorsque la cause est bonne et en accord avec le code, il l'adopte et la gagne.",
    tokens: FR_TOKENS,
    groups: [
      ['Lines', ['P', 'B', 'T', 'D', 'F', 'V', 'K', 'G', 'L', 'R']],
      ['Half circles', ['M', 'N', 'GN', 'S', 'Z', 'J', 'CH']],
      ['Vowels', ['a', 'o', 'ou', 'é', 'i', 'u', 'eu']],
      ['Nasals', ['an', 'in', 'on', 'un']],
      ['Open vowels · house rule', ['è', 'ò', 'œ']],
    ],
    hints: { a: 'a', o: 'o au eau', ou: 'ou', 'é': 'é è ai', i: 'i y', u: 'u', eu: 'eu œ', an: 'an en', in: 'in ain', on: 'on', un: 'un', 'è': 'open [ɛ]: mer, lait', 'ò': 'open [ɔ]: sol, porte', 'œ': 'open [œ]: peur, neuf',
      K: 'c qu', S: 's ç', Z: 'z', J: 'j ge', CH: 'ch', GN: 'gn', R: 'r', L: 'l' },
    ready: async () => {},
    transcribe: fr.transcribe,
    toDuployan: fr.toDuployan,
  },
  en: {
    id: 'en',
    name: 'Sloan-Duployan (English)',
    placeholder: 'Type in English…',
    sample: 'Shorthand is the art of writing as fast as people speak. Practice a little every day, and read your notes aloud.',
    tokens: en.TOKENS,
    groups: en.GROUPS,
    hints: en.HINTS,
    ready: () => en.loadDictionary(new URL('../data/cmudict-en.txt', import.meta.url).href),
    transcribe: en.transcribe,
    toDuployan: en.toDuployan,
  },
};

export function parsePhonemes(text, sys) {
  const toks = text.trim().split(/\s+/).filter(Boolean);
  return { tokens: toks.filter((t) => sys.tokens.includes(t)), bad: toks.filter((t) => !sys.tokens.includes(t)) };
}
