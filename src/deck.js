// Vocabulary decks and a small spaced-repetition scheduler (Leitner boxes).
//
// Deck files are Markdown with one word per list item:
//   - maison | n.f. | house | 房子 | #logement
//     French  part of speech  English  Chinese  tags (optional)
// The topic comes from the front matter ("topic: logement"), else the first
// "# heading", else the file name. Lines in other shapes are ignored.

const LINE = /^\s*[-*]\s+([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*(?:\|(.*))?$/;

export function parseDeck(text, fileName = 'deck') {
  const src = text.replace(/\r\n?/g, '\n');
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  const topic = (fm && fm[1].match(/^topic:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, ''))
    || src.match(/^#\s+(.+)$/m)?.[1].trim()
    || fileName.replace(/\.[^.]+$/, '');
  const cards = [];
  const seen = new Set();
  for (const line of src.split('\n')) {
    const m = line.match(LINE);
    if (!m) continue;
    const [, fr, pos, en, zh] = m;
    if (!fr || !zh || /^[-:]+$/.test(fr)) continue;
    const id = `${fr.toLowerCase()}|${pos}`;
    if (seen.has(id)) continue;
    seen.add(id);
    cards.push({ id, fr, pos, en, zh: zh.replace(/;\s*/g, '；') });
  }
  return { topic, cards };
}

// ---------- scheduling ----------
// Box 0 = new. Each "remembered" moves a card up a box; "again" sends it back to box 1.
const DAY = 864e5;
export const INTERVALS = [0, 1, 3, 7, 14, 30]; // days until a card in box n is due again
export const MAX_BOX = INTERVALS.length - 1;

export function grade(state, known, now = Date.now()) {
  const box = known ? Math.min((state?.box || 0) + 1, MAX_BOX) : 1;
  return { box, due: now + INTERVALS[box] * DAY, seen: (state?.seen || 0) + 1 };
}

/**
 * Pick a session: cards due for review first (oldest first), then new ones.
 * @param cards   [{id, …}]
 * @param progress {id: {box, due}}
 */
export function buildSession(cards, progress, { size = 20, newCards = 12, now = Date.now(), rand = Math.random } = {}) {
  const due = [], fresh = [];
  for (const c of cards) {
    const p = progress[c.id];
    if (!p || !p.box) fresh.push(c);
    else if (p.due <= now) due.push(c);
  }
  due.sort((a, b) => progress[a.id].due - progress[b.id].due);
  // shuffle new cards so a session is not always the start of a file
  for (let i = fresh.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
  const picked = due.slice(0, size);
  for (const c of fresh) { if (picked.length >= size || picked.length - Math.min(due.length, size) >= newCards) break; picked.push(c); }
  return picked;
}

export function stats(cards, progress, now = Date.now()) {
  let fresh = 0, due = 0, learning = 0, known = 0;
  for (const c of cards) {
    const p = progress[c.id];
    if (!p || !p.box) fresh++;
    else if (p.due <= now) due++;
    else if (p.box >= 3) known++;
    else learning++;
  }
  return { total: cards.length, fresh, due, learning, known };
}

// Days in a row with at least one review, ending today or yesterday.
export function streak(days, today = new Date()) {
  const set = new Set(days);
  const key = (d) => d.toISOString().slice(0, 10);
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  if (!set.has(key(d))) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(key(d))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}
