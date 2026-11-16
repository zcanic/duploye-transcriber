// Deck parsing and scheduling. Run: node test/test-deck.mjs
import { parseDeck, grade, buildSession, stats, streak, INTERVALS } from '../src/deck.js';
let fail = 0;
const eq = (name, got, want) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log(`✗ ${name}\n  got  ${g}\n  want ${w}`); } };

const md = `---
topic: logement
---
# logement
## 住所类型
- maison | n.f. | house | 房子 | #logement src:p74
- chambre | n.f. | bedroom; room | 卧室;房间 | #logement
- maison | n.f. | house | 房子 | duplicate is skipped
- avoir faim | expr. | to be hungry | 饿;肚子饿
| table | rows | are | ignored |
- a plain bullet without fields
`;
const d = parseDeck(md, 'logement.md');
eq('topic', d.topic, 'logement');
eq('count', d.cards.length, 3);
eq('card', d.cards[1], { id: 'chambre|n.f.', fr: 'chambre', pos: 'n.f.', en: 'bedroom; room', zh: '卧室；房间' });
eq('no front matter', parseDeck('# Fruits\n- pomme | n.f. | apple | 苹果', 'x.md').topic, 'Fruits');
eq('file name', parseDeck('- pomme | n.f. | apple | 苹果', 'fruits.md').topic, 'fruits');

const now = 1_000_000_000_000;
eq('new -> box 1', grade(undefined, true, now).box, 1);
eq('up a box', grade({ box: 2 }, true, now), { box: 3, due: now + INTERVALS[3] * 864e5, seen: 1 });
eq('again -> box 1', grade({ box: 4, seen: 3 }, false, now).box, 1);
eq('capped', grade({ box: 5 }, true, now).box, 5);

const cards = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}` }));
const progress = { w0: { box: 2, due: now - 10 }, w1: { box: 1, due: now - 50 }, w2: { box: 3, due: now + 1e6 } };
const s = buildSession(cards, progress, { size: 10, newCards: 5, now, rand: () => 0.5 });
eq('due first, oldest first', s.slice(0, 2).map((c) => c.id), ['w1', 'w0']);
eq('then new, capped', s.length, 7);
eq('not-yet-due skipped', s.some((c) => c.id === 'w2'), false);
eq('stats', stats(cards, progress, now), { total: 30, fresh: 27, due: 2, learning: 0, known: 1 });

eq('streak today', streak(['2026-11-14', '2026-11-15', '2026-11-16'], new Date(2026, 10, 16)), 3);
eq('streak from yesterday', streak(['2026-11-14', '2026-11-15'], new Date(2026, 10, 16)), 2);
eq('streak broken', streak(['2026-11-12'], new Date(2026, 10, 16)), 0);

console.log(fail ? `${fail} failed` : 'deck: all pass');
process.exit(fail ? 1 : 0);
