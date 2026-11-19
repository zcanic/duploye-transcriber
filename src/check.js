// Lenient answer checking for the dictation page: accents, case, hyphens,
// apostrophes and spacing don't count, and neither does a leading article.

const ARTICLE = /^(le|la|les|l|un|une|des|du|de la|de l)\s+/;

/** "Quatre-vingt-dix" -> "quatre vingt dix"; "l'été" -> "l ete". */
export function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[’'‘`´-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const loose = (s) => normalize(s).replace(ARTICLE, '').replace(/\b(vingt|cent)s\b/g, '$1');

/** The accepted spellings of an entry: "grand, grande" -> both forms (and the whole). */
export const variants = (answer) => [answer, ...answer.split(/\s*[,;]\s*/)].filter(Boolean);

/** Whether `typed` is one of the answer's forms. */
export function isRight(typed, answer) {
  const t = loose(typed);
  return !!t && variants(answer).some((v) => loose(v) === t);
}
