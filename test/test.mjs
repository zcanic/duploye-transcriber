// Word examples taken from "Sténographie intégrale" (Duployé), pp. 2–17.
// Run: node test/test.mjs
import { wordToPhonemes } from '../src/g2p.js';
import { transcribe } from '../src/duploye.js';

const CASES = {
  // p.2–3 décomposition en sons
  homme: 'o M', 'hâter': 'a T é', ouvert: 'ou V é R', femme: 'F a M', attacher: 'a T a CH é',
  aurore: 'o R o R', 'révéler': 'R é V é L é', 'échanger': 'é CH an J é', 'témoin': 'T é M ou in', physique: 'F i Z i K',
  // monosyllables p.2
  que: 'K', de: 'D', te: 'T', le: 'L', me: 'M', ne: 'N', se: 'S', ce: 'S', je: 'J',
  a: 'a', ah: 'a', au: 'o', aux: 'o', eau: 'o', haut: 'o', oh: 'o', os: 'o', ou: 'ou', houx: 'ou', 'août': 'ou',
  est: 'é', et: 'é', ait: 'é', haie: 'é', eu: 'u', eut: 'u', eux: 'eu', en: 'an', an: 'an', on: 'on', ont: 'on', un: 'un',
  // p.4–7 voyelles cercle
  coke: 'K o K', mode: 'M o D', poupe: 'P ou P', donne: 'D o N', fauve: 'F o V', chape: 'CH a P',
  doute: 'D ou T', pose: 'P o Z', lors: 'L o R', mat: 'M a T', apport: 'a P o R', ovale: 'o V a L',
  moral: 'M o R a L', canal: 'K a N a L', oiseau: 'a Z o', fois: 'F a', toit: 'T a', voir: 'V a R', soir: 'S a R',
  // p.8–11 é / i
  qui: 'K i', quai: 'K é', vie: 'V i', fait: 'F é', lit: 'L i', les: 'L é', assis: 'a S i', assez: 'a S é',
  agit: 'a J i', 'âgé': 'a J é', habit: 'a B i', 'abbé': 'a B é', dit: 'D i', des: 'D é', ami: 'a M i', mes: 'M é',
  type: 'T i P', ride: 'R i D', site: 'S i T', 'même': 'M é M', 'guère': 'G é R', cher: 'CH é R', civil: 'S i V i L',
  // p.12–13 u / eu
  pu: 'P u', peu: 'P eu', vu: 'V u', veut: 'V eu', aigu: 'é G u', heureux: 'eu R eu', mu: 'M u',
  'nœud': 'N eu', connu: 'K o N u', ceux: 'S eu', bureau: 'B u R o', lui: 'L i', suis: 'S i', nuit: 'N i', fruit: 'F R i',
  // p.16–17 nasales
  pan: 'P an', enfin: 'an F in', dans: 'D an', pont: 'P on', 'défunt': 'D é F un', dont: 'D on', quand: 'K an',
  terrain: 'T é R in', gond: 'G on', emprunt: 'an P R un', nain: 'N in', son: 'S on', point: 'P ou in', loin: 'L ou in',
  ombre: 'on B R', ranger: 'R an J é', compte: 'K on T', monde: 'M on D', banque: 'B an K',
  // general
  'sténographie': 'S T é N o G R a F i', petite: 'P T i T', parler: 'P a R L é', fille: 'F i', travail: 'T R a V a i',
  soleil: 'S o L é i', dedans: 'D D an', repose: 'R P o Z', voisin: 'V a Z in', emmurer: 'an M u R é', haineux: 'é N eu', nation: 'N a S i on', examen: 'é G Z a M in', taxi: 'T a K S i', créer: 'K R é é', jeun: 'J un', Hugues: 'u G', peuvent: 'P eu V', furent: 'F u R', fille: 'F i', billet: 'B i é', dune: 'D u N', une: 'u N', dame: 'D a M', plume: 'P L u M', aime: 'é M', fine: 'F i N', aucune: 'o K u N', dames: 'D a M', faim: 'F in', accord: 'a K o R', accroc: 'a K R o K', accent: 'a K S an', lorsque: 'L o R S K', ville: 'V i L',
};

let fail = 0;
for (const [w, exp] of Object.entries(CASES)) {
  const got = wordToPhonemes(w).join(' ');
  if (got !== exp) { fail++; console.log(`✗ ${w.padEnd(14)} got: ${got.padEnd(22)} want: ${exp}`); }
}
// without the speed shortcuts (the canvas default): oi and ui keep both vowels
const FULL = { loi: 'L ou a', voir: 'V ou a R', moi: 'M ou a', lui: 'L u i', nuit: 'N u i', huit: 'u i T', voyage: 'V ou a i a J', qui: 'K i', point: 'P ou in' };
for (const [w, exp] of Object.entries(FULL)) {
  const got = wordToPhonemes(w, { shortcuts: false }).join(' ');
  if (got !== exp) { fail++; console.log(`✗ full ${w.padEnd(9)} got: ${got.padEnd(22)} want: ${exp}`); }
}
const total = Object.keys(CASES).length;
console.log(`\nwords: ${total - fail}/${total} pass`);

// sentence-level checks
const s = transcribe("Ils parlent. J'ai vu l'école. Un pour tous, tous pour un.");
const show = (sent) => sent.map((x) => `${x.text}[${x.tokens.join(' ')}]${x.joinToNext ? '+' : ''}${x.sigle ? '*' : ''}`).join(' ');
const lines = s.map(show);
console.log(lines.join('\n'));
const expectSent = [
  'Ils[i L] parlent[P a R L]',
  "J'[J]+ ai[é] vu[V u] l'[L] école[é K o L]",
  'Un[un] pour[P]* tous[T]* tous[T]* pour[P]* un[un]',
];
expectSent.forEach((e, k) => { if (lines[k] !== e) { fail++; console.log(`✗ sentence ${k}: want ${e}`); } });
process.exit(fail ? 1 : 0);
