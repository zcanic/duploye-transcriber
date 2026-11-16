# Duployé Transcriber

Type French and get it written in **Duployé shorthand** (*sténographie Duployé*, Émile Duployé, 1860), the geometric shorthand system long taught in France and still used for Chinook Jargon.

As far as I could find, no other tool converts French text to Duployé. This one runs entirely in the browser, with no build step and no network calls.

```
French text ──► sounds (rule-based, editable) ──► Unicode Duployan letters ──► Noto Sans Duployan (joins & orients)
"l'avocat"       L a V o K a                      𛰆𛱁𛰉𛱄𛰅𛱁                    one connected stroke
```

## Features

- **French → Duployé sounds** using the method's conventions: silent letters and mute *e* are dropped, [e]/[ɛ] → `é`, [ø]/[œ] → `eu`, *oi* → `a`, *ui* → `i`, *-ent* is silent after *ils/elles*, and so on.
- **Editable sounds for every word.** French spelling has exceptions no rule set covers. Fix a word once and every occurrence updates. Edits are kept in your browser.
- **Sigles**: the first abbreviations taught in the method (*pour, bien, faire, vous, nous, tout, grand, Monsieur, il*).
- **Elision rule**: *l', j', qu'*… join the next word only when it is a monosyllable or starts with a circle vowel (a, o, ou). Otherwise they stand apart.
- Sentences are separated by `×`, and proper nouns and numbers are underlined, as in the manuals.
- Copy the result as Unicode (U+1BC00–1BC9F). It can be pasted anywhere a Duployan font is installed.

## Limitations

- **Sounds**: rule-based with a small exception list, not a pronunciation dictionary. On the word lists of the manual it is right almost every time; on arbitrary text, expect to correct some words, especially loanwords, *-ent* nouns versus verbs, and *-er* words with a sounded r.
- **Drawing**: done by the [Noto Sans Duployan](https://github.com/notofonts/duployan) font, which implements the *generic* Unicode Duployan joining model, not every convention of French manuals. It does not always follow these:
  - *i* turns right and *é* turns left;
  - a vowel goes outside the angle formed by two consonants;
  - the nasals an / in / on / un sit in fixed quarter-circle quadrants.

  Use the output to learn how words break into sounds and to see their overall shape. For exact calligraphy, follow your manual.
- Only the core alphabet and the first sigles are covered. The method's many further abbreviations and affixes are not.

## Run

ES modules need to be served over HTTP:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Tests (word examples from the manual):

```bash
node test/test.mjs
```

## Layout

| Path | What |
|---|---|
| `src/g2p.js` | French spelling → Duployé sound tokens |
| `src/duploye.js` | tokens → Unicode codepoints, sigles, sentence and elision rules |
| `index.html` | the app (no dependencies) |
| `fonts/` | Noto Sans Duployan (SIL OFL 1.1, see `fonts/OFL.txt`) |
| `test/test.mjs` | regression tests |

## References

- *Sténographie intégrale* (Duployé method, published by stenographie.ch): alphabet, vowel rules, and examples used for the tests.
- Van Anderson, [Proposal to include Duployan Shorthands and Chinook script in UCS](https://www.unicode.org/L2/L2010/10026-duployan.pdf) (Unicode L2/10-026, 2010).
- [Noto Sans Duployan](https://github.com/notofonts/duployan) by David Corbett et al., built from [dscorbett/duployan-font](https://github.com/dscorbett/duployan-font).

## License

Code: MIT. Font: SIL Open Font License 1.1.

---

### 中文简介

输入法语，自动转成 Duployé 速记。流程是：先按 Duployé 的规则把单词拆成音，每个词的音都可以手动改；再交给 Noto Sans Duployan 字体负责连写和元音转向。拆音规则基于教材 *Sténographie intégrale*。字体实现的是 Unicode 的通用 Duployan 模型，所以 é/i 的转向、元音画在角外侧、鼻元音的象限这些细节不一定和法语教材完全一致，书写时以教材为准。
