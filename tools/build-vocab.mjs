// Build data/vocab-fr.json, the built-in deck, from a folder of vocabulary notes.
// Usage: node tools/build-vocab.mjs "<folder with .md files>"
// Keeps French, part of speech, English and Chinese only (tags and sources are dropped).
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parseDeck } from '../src/deck.js';

const dir = process.argv[2];
if (!dir) { console.error('Usage: node tools/build-vocab.mjs <folder>'); process.exit(1); }
const topics = readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const d = parseDeck(readFileSync(join(dir, f), 'utf8'), f);
  return { topic: d.topic, cards: d.cards.map((c) => [c.fr, c.pos, c.en, c.zh]) };
}).filter((t) => t.cards.length);
writeFileSync(new URL('../data/vocab-fr.json', import.meta.url), JSON.stringify({ topics }));
console.log(topics.reduce((n, t) => n + t.cards.length, 0), 'cards in', topics.length, 'topics');
