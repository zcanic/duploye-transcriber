// French orthography -> Duployé phoneme tokens: Lexique's pronunciation when the
// word is loaded (src/lexicon.js), spelling rules otherwise.
//
// Duployé writes sounds, not spelling, and uses a reduced inventory:
//   consonants  P B T D F V K G L R M N GN S Z J CH
//   vowels      a o ou é i u eu an in on un
// Notable conventions (Sténographie intégrale, pp. 1–17):
//   - [e] and [ɛ] are both "é"; [ø] and [œ] are both "eu"
//   - the mute / schwa e is never written (consonants "carry" it)
//   - shortcuts (only with ctx.shortcuts): "oi" written as "a", "ui" written as "i";
//     without them, oi is ou + a and ui is u + i, as pronounced
//
// The output is a best guess. French spelling has many exceptions, which is
// why the UI lets the learner edit the phonemes of every word.

import { lookup, phonToTokens } from './lexicon.js';

export const CONSONANTS = ['P', 'B', 'T', 'D', 'F', 'V', 'K', 'G', 'L', 'R', 'M', 'N', 'GN', 'S', 'Z', 'J', 'CH'];
export const VOWELS = ['a', 'o', 'ou', 'é', 'i', 'u', 'eu', 'an', 'in', 'on', 'un', 'è', 'ò', 'œ'];
// House rule (not in the manual): open vowels è [ɛ], ò [ɔ], œ [œ] are told apart from
// é [e], o [o], eu [ø] with an accent on the sign. Without ctx.fine they merge back.
const MERGE = { 'è': 'é', 'ò': 'o', 'œ': 'eu' };
export const TOKENS = [...CONSONANTS, ...VOWELS];

const VOWEL_CHARS = 'aeiouyàâäéèêëîïôöùûüœæ';
const isV = (c) => c !== undefined && VOWEL_CHARS.includes(c);
const FRONT = 'eiyéèêëîï'; // letters that soften c / g

// Whole-word exceptions (phonemes separated by spaces).
const EXCEPTIONS = {
  ai: 'é', zoo: 'Z o', est: 'è', es: 'è', et: 'é', les: 'L é', des: 'D é', mes: 'M é', tes: 'T é', ses: 'S é', ces: 'S é',
  eu: 'u', eus: 'u', eut: 'u', eux: 'eu', os: 'o', 'août': 'ou', aout: 'ou',
  œufs: 'eu', oeufs: 'eu', œuf: 'œ F', oeuf: 'œ F', œil: 'œ i', oeil: 'œ i', yeux: 'i eu',
  femme: 'F a M', femmes: 'F a M', monsieur: 'M eu S i eu', messieurs: 'M é S i eu',
  fils: 'F i S', six: 'S i S', dix: 'D i S', sept: 'S è T', huit: 'i T', vingt: 'V in', cinq: 'S in K',
  mat: 'M a T', net: 'N è T', but: 'B u T', avec: 'a V è K', clef: 'K L é', pied: 'P i é', pieds: 'P i é',
  ville: 'V i L', villes: 'V i L', village: 'V i L a J', mille: 'M i L', tranquille: 'T R an K i L',
  oignon: 'o GN on', hier: 'i è R', pays: 'P é i', gens: 'J an', sens: 'S an S', tabac: 'T a B a',
  second: 'S eu G on', seconde: 'S eu G on D', examen: 'è G Z a M in', album: 'a L B ò M',
  monsieur_: '', // placeholder to keep the list sorted mentally
  // common verbs in -ent (3rd person plural) met without "ils"/"elles" before them
  peuvent: 'P eu V', veulent: 'V eu L', doivent: 'D a V', furent: 'F u R', eurent: 'u R', firent: 'F i R',
  savent: 'S a V', disent: 'D i Z', prennent: 'P R é N', viennent: 'V i é N', font: 'F on', sont: 'S on',
  client: 'K L i an', clients: 'K L i an', patient: 'P a S i an', science: 'S i an S',
  orient: 'ò R i an', ancien: 'an S i in', sœur: 'S œ R', soeur: 'S œ R', cœur: 'K œ R', coeur: 'K œ R',
  plus: 'P L u', tous: 'T ou S', ours: 'ou R S', mars: 'M a R S', hélas: 'é L a S', bus: 'B u S',
  autobus: 'o T o B u S', tennis: 'T è N i S', jadis: 'J a D i S', maïs: 'M a i S', vis: 'V i S',
  cactus: 'K a K T u S', virus: 'V i R u S', bonus: 'B ò N u S', iris: 'i R i S', oasis: 'ò a Z i S',
  gaz: 'G a Z', fier: 'F i è R', hiver: 'i V è R', amer: 'a M è R', enfer: 'an F è R', cancer: 'K an S è R',
  super: 'S u P è R', revolver: 'R é V ò L V è R', chaos: 'K a o', écho: 'é K o', orchestre: 'ò R K è S T R',
  chœur: 'K œ R', choeur: 'K œ R', chrétien: 'K R é T i in', technique: 'T è K N i K',
};
delete EXCEPTIONS.monsieur_;

// "-er" words where the r is pronounced (beyond the 3-letter ones, kept by default).
const KEEP_ER = new Set(['hiver', 'amer', 'enfer', 'cancer', 'super', 'fier', 'hier', 'cher', 'revolver', 'laser', 'hamster', 'master', 'poster', 'cuiller', 'éther', 'reporter']);

const parse = (s) => (s ? s.split(/\s+/).filter(Boolean) : []);

// Strip silent endings. Returns { stem, finalE } where finalE means a mute e
// (or -es / -ent) followed the last consonant, so that consonant is pronounced.
function stripEnding(w, ctx) {
  if (ctx.afterSubjectPronoun && w.length > 4 && w.endsWith('ent') && !w.endsWith('ment')) {
    return { stem: w.slice(0, -3), finalE: true };
  }
  if (ctx.afterSubjectPronoun && w.endsWith('aient')) return { stem: w.slice(0, -3), finalE: false };
  if (w.endsWith('aient')) return { stem: w.slice(0, -3), finalE: false }; // étaient -> étai
  let s = w;
  if (s.length > 2 && (s.endsWith('s') || s.endsWith('x')) && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length >= 2 && s.endsWith('e') && !s.endsWith('ée') && !s.endsWith('ie') && !s.endsWith('ue') && !s.endsWith('oue')) {
    return { stem: s.slice(0, -1), finalE: true };
  }
  if (s.length >= 2 && s.endsWith('e')) return { stem: s.slice(0, -1), finalE: false }; // année, vie, rue, joue
  // pronounced-r -er words keep their r; other -er / -ez / -et / -ed sound "é"
  if (s.endsWith('er') && s.length > 3 && !KEEP_ER.has(s)) return { stem: s.slice(0, -2) + 'é', finalE: false };
  if (/et$/.test(s) && s.length > 2) return { stem: s.slice(0, -2) + 'è', finalE: false }; // effet, ballet
  if (/(ez|ed)$/.test(s) && s.length > 2) return { stem: s.slice(0, -2) + 'é', finalE: false };
  // silent final consonants (keep c r f l, "CaReFuL"); c after n is silent too (blanc, banc)
  s = s.replace(/[tdpgsxz]+$/, '');
  if (/nc$/.test(s)) s = s.slice(0, -1);
  return { stem: s, finalE: false };
}

// Is the grapheme at w[i..i+len) a nasal vowel? Only if not followed by a vowel or by n/m.
// `at` looks past the stripped ending, so the mute e of "dune", "dame", "aime" still counts.
function nasalOK(w, i, len, at = (k) => w[k]) {
  const next = at(i + len);
  if (next === undefined) return true;
  if (isV(next)) return false;
  if (next === 'n' || next === 'm') {
    // emm-, enn- at word start are nasal (emmener, ennui)
    return i === 0 && (w.startsWith('emm') || w.startsWith('enn'));
  }
  return true;
}

const CLUSTER_OK = new Set(['bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr', 'tr', 'vr', 'ch', 'ph', 'th', 'gn']);

// Letter e (no accent): é when "closed" by a consonant in the same syllable, else mute.
function eSound(w, i) {
  const a = w[i + 1], b = w[i + 2];
  if (a === undefined) return null; // final e (normally stripped already)
  if (a === 'x') return 'è';
  if (isV(a)) return null;
  if (b === undefined) return 'è'; // e + final consonant: mer, sel, avec
  if (isV(b)) return null; // e + C + V: open syllable, mute (petit, venir)
  if (a === b) return 'è'; // double consonant: elle, terre, effet
  if (CLUSTER_OK.has(a + b)) return null; // e + CL cluster: mute (secret ~ sec-ret)
  return 'è'; // e + two consonants: merci, reste
}

// o is closed [o] at the end of a word (mot, dos, trop) and before a [z] (rose, chose);
// elsewhere open [ɔ] (porte, sol, école, homme).
function oClosed(w, j, at) {
  if (j >= w.length) return true;
  const n = at(j);
  return n === 'z' || (n === 's' && isV(at(j + 1)) && w[j + 1] !== 's');
}

// eu is closed [ø] at the end of a word (deux, peu), before [z] (heureuse), before -tr
// (neutre) and in open syllables (jeudi); open [œ] before r (peur, heure) and in a
// closed final syllable (neuf, seul, jeune).
function euSound(w, j, at, circumflex) {
  if (circumflex || j >= w.length) return 'eu';
  const n = at(j);
  if (n === 'r') return 'œ';
  if (n === 's' && isV(at(j + 1))) return 'eu';
  if (n === 't' && at(j + 1) === 'r') return 'eu';
  if (!isV(n) && (j + 1 >= w.length || !isV(w[j + 1]))) return 'œ';
  return 'eu';
}

// Lexique writes o and eu in unstressed syllables as closed ([adoʀe], [pløʀe]), where
// dictionaries such as the Robert give [adɔʀe], [plœʀe], and it has a few slips in eu
// (peur [pøʀ]). When the word has as many o (or eu) vowels both ways, the spelling
// rules decide their quality: for eu everywhere (the rule is regular), for o except in
// the last syllable, where Lexique knows better (rhinocéros, rose, sol).
const FAMILIES = [[new Set(['o', 'ò']), true], [new Set(['eu', 'œ']), false]];
function harmonize(lex, rules) {
  const out = lex.slice();
  let last = -1;
  out.forEach((t, k) => { if (VOWELS.includes(t)) last = k; });
  for (const [fam, keepLast] of FAMILIES) {
    const a = [], b = [];
    out.forEach((t, k) => fam.has(t) && a.push(k));
    rules.forEach((t) => fam.has(t) && b.push(t));
    if (a.length !== b.length) continue;
    a.forEach((k, n) => { if (!keepLast || k !== last) out[k] = b[n]; });
  }
  return out;
}

// Exceptions spelled with the oi/ui shortcuts, and their full forms.
const FULL_FORMS = { huit: 'u i T', doivent: 'D ou a V' };

export function wordToPhonemes(raw, ctx = {}) {
  const short = ctx.shortcuts !== false; // the manual's speed shortcuts (oi -> a, ui -> i)
  let w = raw.toLowerCase().normalize('NFC').replace(/’/g, "'");
  const finish = (toks) => (ctx.fine ? toks : toks.map((t) => MERGE[t] || t));
  if (!short && FULL_FORMS[w] !== undefined) return finish(parse(FULL_FORMS[w]));
  if (EXCEPTIONS[w] !== undefined) return finish(parse(EXCEPTIONS[w]));
  const lex = ctx.lexicon !== false && lookup(w);
  if (lex) {
    const toks = phonToTokens(ctx.afterSubjectPronoun && lex.plural ? lex.plural : lex.phon, { oi: short && /o[iîy]/.test(w), ui: short && /ui/.test(w) });
    // Lexique sometimes writes the schwa as [ø] (ce [sø], dehors, premier): never written
    if (!/eu|eû|œ/.test(w)) for (let k = toks.length - 1; k >= 0; k--) if (toks[k] === 'eu') toks.splice(k, 1);
    return finish(harmonize(toks, wordToPhonemes(raw, { ...ctx, lexicon: false, fine: true })));
  }
  const orig = w;
  const { stem } = stripEnding(w, ctx);
  w = stem;
  // look-ahead into the stripped ending too: "ce" keeps a soft c, "pose" a voiced s
  const at = (k) => (k < w.length ? w[k] : /[éè]$/.test(w) ? undefined : orig[k]);
  const out = [];
  const push = (...t) => out.push(...t);
  let i = 0;
  while (i < w.length) {
    const c = w[i];
    const r = w.slice(i);
    const prev = w[i - 1];
    // ---------- vowels ----------
    if (r.startsWith('eau')) { push('o'); i += 3; continue; }
    if (/^(aill|ail$)/.test(r)) { push('a', 'i'); i += r.startsWith('aill') ? 4 : 3; continue; }
    if (/^(eill|eil$)/.test(r)) { push('è', 'i'); i += r.startsWith('eill') ? 4 : 3; continue; }
    if (/^(euill|euil$)/.test(r)) { push('œ', 'i'); i += r.startsWith('euill') ? 5 : 4; continue; }
    if (/^(ueill|ueil$)/.test(r)) { push('œ', 'i'); i += r.startsWith('ueill') ? 5 : 4; continue; }
    if (/^(ouill|ouil$)/.test(r)) { push('ou', 'i'); i += r.startsWith('ouill') ? 5 : 4; continue; }
    if (r.startsWith('ill') && i > 0 && !isV(prev)) { if (out[out.length - 1] !== 'i') push('i'); i += 3; continue; } // fille, billet
    if (/^(ain|aim|ein)/.test(r) && nasalOK(w, i, 3, at)) { push('in'); i += 3; continue; }
    if (r.startsWith('oin') && nasalOK(w, i, 3, at)) { push('ou', 'in'); i += 3; continue; }
    if (r.startsWith('eun') && nasalOK(w, i, 3, at)) { push('un'); i += 3; continue; } // à jeun
    if (r.startsWith('ien') && nasalOK(w, i, 3, at)) { push('i', 'in'); i += 3; continue; }
    if (r.startsWith('éen') && nasalOK(w, i, 3, at)) { push('é', 'in'); i += 3; continue; }
    if (/^(an|am|en|em)/.test(r) && nasalOK(w, i, 2, at)) { push('an'); i += 2; continue; }
    if (/^(on|om)/.test(r) && nasalOK(w, i, 2, at)) { push('on'); i += 2; continue; }
    if (/^(in|im|yn|ym)/.test(r) && nasalOK(w, i, 2, at)) { push('in'); i += 2; continue; }
    if (/^(un|um)/.test(r) && nasalOK(w, i, 2, at)) { push('un'); i += 2; continue; }
    if (/^oy[aeiou]/.test(r)) { if (short) push('a', 'i'); else push('ou', 'a', 'i'); i += 2; continue; } // voyage
    if (/^ay[aeiou]/.test(r)) { push('é', 'i'); i += 2; continue; } // payer
    if (/^(oi|oî)/.test(r)) { if (short) push('a'); else push('ou', 'a'); i += 2; continue; } // oi: [wa]
    if (/^(ou|où|oû)/.test(r)) { push('ou'); i += 2; continue; }
    if (/^(au)/.test(r)) { push('o'); i += 2; continue; }
    if (/^(ai|aî|ei)/.test(r)) {
      // [ɛ], except the verb endings j'ai and the future -rai, which are [e]
      const verbAi = i + 2 >= w.length && r.startsWith('ai') && (orig === 'ai' || (orig.endsWith('rai') && orig !== 'vrai'));
      push(verbAi ? 'é' : 'è'); i += 2; continue;
    }
    if (/^(eu|eû|œu)/.test(r)) { push(euSound(w, i + 2, at, r.startsWith('eû'))); i += 2; continue; }
    if (c === 'œ') { push(euSound(w, i + 1, at, false)); i += 1; continue; }
    if (r.startsWith('ui') && !(prev === 'q' || prev === 'g')) { if (short) push('i'); else push('u', 'i'); i += 2; continue; } // ui: [ɥi]
    if ('éèêë'.includes(c)) { push(c === 'é' ? 'é' : 'è'); i += 1; continue; }
    if (c === 'e') { const s = eSound(w, i); if (s) push(s); i += 1; continue; }
    if ('aàâä'.includes(c)) { push('a'); i += 1; continue; }
    if ('iîïy'.includes(c)) { push('i'); i += 1; continue; }
    if (r === 'oo') { push('o'); i += 2; continue; } // zoo: one closed [o]
    if ('oôö'.includes(c)) { push(c === 'ô' || oClosed(w, i + 1, at) ? 'o' : 'ò'); i += 1; continue; }
    if ('uûùü'.includes(c)) { push('u'); i += 1; continue; }
    // ---------- consonants ----------
    if (r.startsWith('sch')) { push('CH'); i += 3; continue; }
    if (r.startsWith('ch')) { push('CH'); i += 2; continue; }
    if (r.startsWith('ph')) { push('F'); i += 2; continue; }
    if (r.startsWith('th')) { push('T'); i += 2; continue; }
    if (r.startsWith('gn')) { push('GN'); i += 2; continue; }
    if (r.startsWith('qu')) { push('K'); i += 2; continue; }
    if (r.startsWith('gu') && FRONT.includes(at(i + 2) ?? '#')) { push('G'); i += 2; continue; } // guerre, Hugues
    if (r.startsWith('ge') && 'aoouâô'.includes(w[i + 2] ?? '#')) { push('J'); i += 2; continue; } // mangeons
    if (/^(tion|tiel|tieu)/.test(r) && prev !== 's' && i > 0) { push('S', 'i'); i += 2; continue; }
    if (r.startsWith('cc') && FRONT.includes(w[i + 2] ?? '#')) { push('K', 'S'); i += 2; continue; }
    if (r.startsWith('cc') || r.startsWith('ck')) { push('K'); i += 2; continue; } // accord, accroc
    if (r.startsWith('ss')) { push('S'); i += 2; continue; }
    if (c === 'x') {
      if (i === 1 && w[0] === 'e' && isV(w[2])) { push('G', 'Z'); } else push('K', 'S');
      i += 1; continue;
    }
    if (c === 'c') { push(FRONT.includes(at(i + 1) ?? '#') ? 'S' : 'K'); i += 1; continue; }
    if (c === 'ç') { push('S'); i += 1; continue; }
    if (c === 'g') { push(FRONT.includes(at(i + 1) ?? '#') ? 'J' : 'G'); i += 1; continue; }
    if (c === 's') { push(isV(prev) && isV(at(i + 1)) ? 'Z' : 'S'); i += 1; continue; }
    if (c === 'p' && prev === 'm' && w[i + 1] === 't') { i += 1; continue; } // compte, dompter
    if (c === 'h') { i += 1; continue; }
    if (c === 'w') { push('ou'); i += 1; continue; }
    const simple = { p: 'P', b: 'B', t: 'T', d: 'D', f: 'F', v: 'V', k: 'K', q: 'K', l: 'L', r: 'R', m: 'M', n: 'N', j: 'J', z: 'Z' }[c];
    if (simple) {
      push(simple);
      i += w[i + 1] === c ? 2 : 1; // doubled consonant = one sound
      continue;
    }
    i += 1; // apostrophes, hyphens, digits, unknown
  }
  return finish(out);
}
