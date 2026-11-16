"""Build data/cmudict-en.txt from the CMU Pronouncing Dictionary.

Usage: python3 tools/build-cmudict.py path/to/cmudict.dict

Output: one line per word, "word<TAB>code", where code spells the first
pronunciation with one character per phoneme (see PHONES; stress is dropped,
except that unstressed AH becomes AX, the schwa).
"""
import re, sys

PHONES = ['AA','AE','AH','AX','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW',
          'B','CH','D','DH','F','G','HH','JH','K','L','M','N','NG','P','R','S','SH','T','TH','V','W','Y','Z','ZH']
CODE = 'abcdefghijklmnopBCDEFGHIJKLMNPQRSTUVWXYZ'  # 40 symbols, one per phone
assert len(PHONES) == len(CODE)
MAP = dict(zip(PHONES, CODE))

seen = set()
out = []
for line in open(sys.argv[1], encoding='utf-8'):
    line = line.split('#')[0].strip()
    if not line:
        continue
    word, *phones = line.split()
    if '(' in word or not re.fullmatch(r"[a-z][a-z']*", word) or word in seen:
        continue
    seen.add(word)
    code = []
    for p in phones:
        base = re.sub(r'\d', '', p)
        if base == 'AH' and p.endswith('0'):
            base = 'AX'
        code.append(MAP[base])
    out.append(f"{word}\t{''.join(code)}")
open('data/cmudict-en.txt', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print(len(out), 'words')
