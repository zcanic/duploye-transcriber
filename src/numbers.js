// Numbers 0–9999 spelled out in French (traditional spelling: hyphens below
// a hundred, "et" in 21, 31 … 71, "quatre-vingts" and "deux cents" plural) and
// written in Chinese numerals, for the dictation page.

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };

function below100(n) {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10), u = n % 10;
  if (t === 7 || t === 9) { // soixante-dix …, quatre-vingt-dix …
    const base = t === 7 ? 'soixante' : 'quatre-vingt';
    return t === 7 && u === 1 ? 'soixante et onze' : `${base}-${UNITS[10 + u]}`;
  }
  if (t === 8) return u ? `quatre-vingt-${UNITS[u]}` : 'quatre-vingts';
  return u === 0 ? TENS[t] : u === 1 ? `${TENS[t]} et un` : `${TENS[t]}-${UNITS[u]}`;
}

function below1000(n) {
  const h = Math.floor(n / 100), r = n % 100;
  if (!h) return below100(r);
  if (!r) return h === 1 ? 'cent' : `${UNITS[h]} cents`;
  return `${h === 1 ? 'cent' : `${UNITS[h]} cent`} ${below100(r)}`;
}

/** 347 -> "trois cent quarante-sept", 2080 -> "deux mille quatre-vingts". */
export function frenchNumber(n) {
  if (!Number.isInteger(n) || n < 0 || n > 9999) throw new RangeError(`0–9999 only: ${n}`);
  if (n === 0) return 'zéro';
  const k = Math.floor(n / 1000), r = n % 1000;
  const thousands = k ? (k === 1 ? 'mille' : `${UNITS[k]} mille`) : '';
  return [thousands, r ? below1000(r) : ''].filter(Boolean).join(' ');
}

const ZH = '零一二三四五六七八九';
/** 347 -> "三百四十七", 1005 -> "一千零五", 15 -> "十五", 2000 -> "两千". */
export function chineseNumber(n) {
  if (n === 0) return '零';
  const digits = String(n).padStart(4, '0').split('').map(Number); // 千 百 十 个
  const units = ['千', '百', '十', ''];
  let out = '', zero = false;
  digits.forEach((d, i) => {
    if (!d) { if (out) zero = true; return; }
    if (zero) { out += '零'; zero = false; }
    const word = d === 2 && i < 2 ? '两' : ZH[d];
    out += (i === 2 && d === 1 && !out) ? '十' : word + units[i]; // 十五, not 一十五
  });
  return out;
}

/**
 * A number to practise: a quarter each from 0–9, 10–99, 100–999 and 1000–9999,
 * so short numbers (where the irregular words are) come up as often as long ones.
 */
export function randomNumber(rand = Math.random) {
  const band = Math.floor(rand() * 4);
  const lo = band ? 10 ** band : 0, hi = 10 ** (band + 1);
  return lo + Math.floor(rand() * (hi - lo));
}
