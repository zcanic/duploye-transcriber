# Duployé Transcriber

Type French or English and watch it written in **Duployé shorthand**: the original French *sténographie Duployé* (Émile Duployé, 1860), or **Sloan-Duployan**, its most widespread English adaptation (J. M. Sloan, 1882).

As far as I could find, no other tool converts text to Duployé. This one runs entirely in the browser, with no build step.

**Live:** [canvas](https://zcanic.github.io/duploye-transcriber/) · [lessons](https://zcanic.github.io/duploye-transcriber/learn.html) · [embed](https://zcanic.github.io/duploye-transcriber/embed.html)

```
French text ──► sounds (rule-based, editable) ──► Unicode Duployan ──► HarfBuzz + Noto Sans Duployan ──► SVG outlines, inked stroke by stroke
"l'avocat"       L a V o K a                      𛰆𛱁𛰉𛱄𛰅𛱁        (joins letters, orients vowels)
```

## Features

- **Watch it written.** Each word is drawn stroke by stroke on a dot-grid sheet, in the direction the pen travels. When you edit the text, only the words that changed are rewritten; the rest glide to their new places.
- **Infinite canvas.** Drag to pan, scroll or pinch to zoom, press `0` to fit.
- **French and English.** Switch with the FR / EN control. English uses Sloan-Duployan signs and the CMU Pronouncing Dictionary (125,000 words, loaded only when you switch); words it lacks are guessed from spelling and flagged.
- **French → Duployé sounds** using the method's conventions: silent letters and mute *e* are dropped, [e]/[ɛ] → `é`, [ø]/[œ] → `eu`, *oi* → `a`, *ui* → `i`, *-ent* is silent after *ils/elles*, and so on.
- **Tap a word to fix its sounds.** French spelling has exceptions no rule set covers. Remove a sound by tapping it, add one from the alphabet. The fix applies to every occurrence and is kept in your browser.
- **Alphabet drawer** drawn to one scale, so short and long strokes (P / B, T / D…) keep their real proportions.
- **Sigles / word signs**: the first abbreviations taught in each method (French *pour, bien, faire, vous, nous, tout, grand, Monsieur, il*; English *the, to, and, do, of, all, be, but, by, have, very, in, go, good, put, people…*).
- **Elision rule**: *l', j', qu'*… join the next word only when it is a monosyllable or starts with a circle vowel (a, o, ou). Otherwise they stand apart.
- Sentences are separated by `×`, and proper nouns and numbers are underlined, as in the manuals.
- **Export** the page as SVG, or copy it as Unicode (U+1BC00–1BC9F).

Keys: `R` write again · `0` fit · `+`/`-` zoom · `G` gloss · `A` alphabet · `Esc` close · `⌘/Ctrl+Enter` in the text box writes again.

## Lessons: notebooks with live shorthand

[`learn.html`](https://zcanic.github.io/duploye-transcriber/learn.html) reads lessons written in plain Markdown, the way a Jupyter notebook mixes prose and cells. Every shorthand cell is live: it writes itself out when scrolled into view, and the reader can edit its text. Drill cells hide the answer until the reader checks.

````markdown
---
title: Circle vowels
lang: fr              # fr = Duployé, en = Sloan-Duployan
---
Ordinary **Markdown**: headings, lists, tables, > notes, `code`, [links](https://…).

```steno sounds
coke mode poupe        ← live cell; "sounds" lists each word's sounds,
```                       "nogloss" hides the words, "nosigles" spells out abbreviations,
                          "lang=en" switches system for one cell

```signs
P B T D                ← single signs at true scale, one row per line
```

```write
homme                  ← write it yourself, then check
homme = o M            ← "= sounds" fixes the answer when the rules guess wrong
```

```read
coke                   ← shorthand shown, word hidden
```
````

The built-in course lives in [`lessons/`](lessons/) and is listed in `lessons/index.json`. To read your own notebook, host the `.md` file anywhere that allows cross-origin requests (a GitHub raw URL works), then open `learn.html?src=<its URL>`. Everything in a notebook is escaped; only the Markdown subset above becomes markup.

## Embed: `<duploye-text>`

Add shorthand to any page with one script and one tag. See [`embed.html`](https://zcanic.github.io/duploye-transcriber/embed.html) for live examples.

```html
<script type="module" src="https://zcanic.github.io/duploye-transcriber/src/embed.js"></script>
<duploye-text lang="fr" gloss>Un pour tous, tous pour un.</duploye-text>
```

Attributes: `lang` (`fr` or `en`), `gloss`, `nosigles`, `size` (px per em), `width` (wrap width), `static` (no animation). The ink takes the element's CSS `color`; `el.replay()` writes it again.

## Limitations

- **Sounds**: rule-based with a small exception list, not a pronunciation dictionary. On the word lists of the manual it is right almost every time; on arbitrary text, expect to correct some words, especially loanwords, *-ent* nouns versus verbs, and *-er* words with a sounded r.
- **Drawing**: done by the [Noto Sans Duployan](https://github.com/notofonts/duployan) font, which implements the *generic* Unicode Duployan joining model, not every convention of French manuals. It does not always follow these:
  - *i* turns right and *é* turns left;
  - a vowel goes outside the angle formed by two consonants;
  - the nasals an / in / on / un sit in fixed quarter-circle quadrants.

  Use the output to learn how words break into sounds and to see their overall shape. For exact calligraphy, follow your manual.
- Only the core alphabet and the first sigles are covered. The methods' many further abbreviations and affixes are not, nor Sloan's thickened strokes for an added r.
- **English specifics**: pronunciations are American (CMU), while Sloan wrote British English, so a few vowels differ from the manual. Unicode has no code point for Sloan's *y*, so it is written with the *i* hook, and the five small-quadrant nasals (ăn ĕn ĭn ŏn ŭn) use the closest Unicode nasal letters.

## Run

ES modules need to be served over HTTP:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Tests (word examples from the manual):

```bash
node test/test.mjs      # French
node test/test-en.mjs   # English
```

Rebuild the English dictionary from a new CMUdict release with `python3 tools/build-cmudict.py cmudict.dict`.

## Layout

| Path | What |
|---|---|
| `src/g2p.js` | French spelling → Duployé sound tokens |
| `src/duploye.js` | tokens → Unicode codepoints, sigles, sentence and elision rules |
| `src/english.js` | English: CMU phones → Sloan-Duployan signs, word signs, spelling fallback |
| `src/systems.js` | the two writing systems behind one interface |
| `src/shaper.js` | HarfBuzz (WASM) shaping → positioned glyph outlines |
| `src/sheet.js` | shared layout, SVG drawing and stroke-by-stroke ink |
| `src/runtime.js` | loads the font and dictionaries once, from the module's own location |
| `src/app.js`, `src/style.css`, `index.html` | the canvas |
| `src/notebook.js`, `src/learn.js`, `src/learn.css`, `learn.html` | the notebook format and the lessons page |
| `src/embed.js`, `embed.html` | the `<duploye-text>` web component |
| `lessons/` | the built-in course (Chinese, French Duployé) |
| `src/tokens.css` | shared colors and type |
| `vendor/harfbuzzjs/` | [harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs) 1.6.4 (MIT) |
| `fonts/` | Noto Sans Duployan (SIL OFL 1.1, see `fonts/OFL.txt`) |
| `data/cmudict-en.txt` | CMU Pronouncing Dictionary, compacted (BSD-style, see `data/cmudict-LICENSE.txt`) |
| `test/test.mjs` | regression tests |

## References

- *Sténographie intégrale* (Duployé method, published by stenographie.ch): alphabet, vowel rules, and examples used for the tests.
- J. M. Sloan, [*The Sloan-Duployan Shorthand Instructor*](https://archive.org/details/sloan-duployan-instructor-1934) (Collins, 1934): English alphabet, vowel signs, word signs, and the examples in `test/test-en.mjs`.
- [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict).
- Van Anderson, [Proposal to include Duployan Shorthands and Chinook script in UCS](https://www.unicode.org/L2/L2010/10026-duployan.pdf) (Unicode L2/10-026, 2010).
- [Noto Sans Duployan](https://github.com/notofonts/duployan) by David Corbett et al., built from [dscorbett/duployan-font](https://github.com/dscorbett/duployan-font).

## License

Code: MIT. Font: SIL Open Font License 1.1. harfbuzzjs: MIT. CMUdict: BSD-style (see `data/cmudict-LICENSE.txt`).

---

### 中文简介

输入法语或英语，在点阵纸上一笔一笔写成 Duployé 速记。内置中文课程（learn.html）用 Markdown 笔记本格式编写，里面的速记格子可以编辑、重放，练习题点击后才显示答案；任何人都可以用同样的格式写自己的课程。英语用的是 Sloan-Duployan 体系，读音查 CMU 发音词典，查不到的词按拼写猜并标出来。流程是：先按 Duployé 的规则把单词拆成音，每个词的音都可以手动改；再交给 Noto Sans Duployan 字体负责连写和元音转向。拆音规则基于教材 *Sténographie intégrale*。字体实现的是 Unicode 的通用 Duployan 模型，所以 é/i 的转向、元音画在角外侧、鼻元音的象限这些细节不一定和法语教材完全一致，书写时以教材为准。
