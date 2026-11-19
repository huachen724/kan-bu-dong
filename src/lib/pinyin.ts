/** Pinyin utilities: numbered ⇄ tone marks, tone extraction and search-query parsing. */

const MARKS: Record<string, string> = {
  a: 'āáǎà',
  e: 'ēéěè',
  i: 'īíǐì',
  o: 'ōóǒò',
  u: 'ūúǔù',
  v: 'ǖǘǚǜ',
};

const MARKED_TO_BASE = new Map<string, [string, number]>();
for (const [base, marks] of Object.entries(MARKS)) {
  [...marks].forEach((m, i) => {
    MARKED_TO_BASE.set(m, [base, i + 1]);
    MARKED_TO_BASE.set(m.toUpperCase(), [base.toUpperCase(), i + 1]);
  });
}
MARKED_TO_BASE.set('ü', ['v', 0]);
MARKED_TO_BASE.set('Ü', ['V', 0]);

export const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
export const hasCJK = (s: string) => CJK_RE.test(s);
export const isCJKChar = (c: string) => CJK_RE.test(c);

/** "hao3" → "hǎo", "lv4" → "lǜ", "ma5" → "ma" */
export function syllableToMarked(syl: string): string {
  const m = /^([a-zA-ZüÜ:]+)([0-5])$/.exec(syl);
  if (!m) return syl.replace(/u:/g, 'ü').replace(/v/g, 'ü').replace(/V/g, 'Ü');
  let letters = m[1]!.replace(/u:/g, 'v').replace(/U:/g, 'V').replace(/ü/g, 'v').replace(/Ü/g, 'V');
  const tone = Number(m[2]);
  if (tone === 0 || tone === 5) return letters.replace(/v/g, 'ü').replace(/V/g, 'Ü');
  const lower = letters.toLowerCase();
  let idx = lower.indexOf('a');
  if (idx < 0) idx = lower.indexOf('e');
  if (idx < 0) idx = lower.indexOf('ou');
  if (idx < 0) {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('aeiouv'.includes(lower[i]!)) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return letters; // e.g. "m2", "ng2"
  const ch = letters[idx]!;
  const marks = MARKS[ch.toLowerCase()]!;
  let marked = marks[tone - 1]!;
  if (ch !== ch.toLowerCase()) marked = marked.toUpperCase();
  letters = letters.slice(0, idx) + marked + letters.slice(idx + 1);
  return letters.replace(/v/g, 'ü').replace(/V/g, 'Ü');
}

/** "ni3 hao3" → "nǐ hǎo". Already-marked input is returned unchanged. */
export function toMarked(p: string): string {
  if (!/[0-5]/.test(p)) return p.replace(/u:/g, 'ü');
  return p
    .split(/(\s+|,|·)/)
    .map((tok) => (/^[a-zA-ZüÜ:]+[0-5]$/.test(tok) ? syllableToMarked(tok) : tok))
    .join('');
}

/** Tone number of a syllable (numbered or marked), 5 = neutral, 0 = unknown */
export function toneOf(syl: string): number {
  const d = /([0-5])$/.exec(syl);
  if (d) return Number(d[1]) || 5;
  for (const ch of syl) {
    const hit = MARKED_TO_BASE.get(ch);
    if (hit && hit[1]) return hit[1];
  }
  return /[a-z]/i.test(syl) ? 5 : 0;
}

/** Split pinyin into displayable syllables with tones: "ni3 hao3" → [{text:'nǐ',tone:3}, …] */
export function syllables(p: string): { text: string; tone: number }[] {
  const out: { text: string; tone: number }[] = [];
  for (const tok of p.trim().split(/\s+/)) {
    if (!tok) continue;
    out.push({ text: syllableToMarked(tok), tone: toneOf(tok) });
  }
  return out;
}

/** "Nǐ hǎo" / "ni3 hao3" → "ni hao" */
export function stripTones(p: string): string {
  let out = '';
  for (const ch of p) {
    const hit = MARKED_TO_BASE.get(ch);
    out += hit ? hit[0].replace('v', 'ü').replace('V', 'Ü') : ch;
  }
  return out.replace(/[0-5]/g, '');
}

/** key used for dictionary matching: "Nv3 hai2 zi5" → "nv3hai2zi5" */
export function toneKey(p: string): string {
  return p
    .toLowerCase()
    .replace(/u:/g, 'v')
    .replace(/ü/g, 'v')
    .replace(/[^a-z1-5]/g, '');
}

// ---------------------------------------------------------------- query parsing

export interface QuerySyllable {
  letters: string;
  tone: number; // 0 = unspecified
}

export interface ParsedPinyin {
  syllables: QuerySyllable[];
  lastIsPartial: boolean;
}

/**
 * Parses free-form pinyin input ("ni3 hao3", "nǐ hǎo", "ni hao", "nihao", "zhongg") into syllables.
 * Returns null if the text can't be read as pinyin (so it's treated as English only).
 */
export function parsePinyinQuery(q: string, valid: Set<string>, prefixes: Set<string>): ParsedPinyin | null {
  const src = q.trim().replace(/u:/gi, 'v');
  if (!src || !/^[a-zA-Z0-5\s'’\-āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜ]+$/.test(src)) return null;

  // chunks separated by spaces / apostrophes / digits; marks record their tone at a letter position
  type Chunk = { letters: string; marks: Map<number, number>; trailingTone: number };
  const chunks: Chunk[] = [];
  let cur: Chunk = { letters: '', marks: new Map(), trailingTone: 0 };
  const flush = (tone = 0) => {
    if (cur.letters) {
      cur.trailingTone = tone;
      chunks.push(cur);
    }
    cur = { letters: '', marks: new Map(), trailingTone: 0 };
  };
  for (const ch of src) {
    if (/[\s'’-]/.test(ch)) flush();
    else if (/[0-5]/.test(ch)) flush(Number(ch) || 5);
    else {
      const hit = MARKED_TO_BASE.get(ch);
      if (hit) {
        if (hit[1]) cur.marks.set(cur.letters.length, hit[1]);
        cur.letters += hit[0].toLowerCase();
      } else cur.letters += ch.toLowerCase();
    }
  }
  flush();
  if (!chunks.length) return null;

  const result: QuerySyllable[] = [];
  let lastIsPartial = false;
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c]!;
    const allowPartial = c === chunks.length - 1 && !chunk.trailingTone;
    const seg = segmentSyllables(chunk.letters, valid, allowPartial ? prefixes : null);
    if (!seg) return null;
    let pos = 0;
    seg.parts.forEach((letters, i) => {
      let tone = 0;
      for (let k = pos; k < pos + letters.length; k++) if (chunk.marks.has(k)) tone = chunk.marks.get(k)!;
      if (i === seg.parts.length - 1 && chunk.trailingTone) tone = chunk.trailingTone;
      result.push({ letters, tone });
      pos += letters.length;
    });
    if (c === chunks.length - 1) lastIsPartial = seg.lastIsPartial;
  }
  return { syllables: result, lastIsPartial };
}

/** DP segmentation preferring the fewest syllables. The final piece may be a prefix if `prefixes` is given. */
function segmentSyllables(
  s: string,
  valid: Set<string>,
  prefixes: Set<string> | null,
): { parts: string[]; lastIsPartial: boolean } | null {
  const n = s.length;
  const best: (null | { count: number; prev: number; partial: boolean })[] = Array(n + 1).fill(null);
  best[0] = { count: 0, prev: -1, partial: false };
  for (let i = 0; i < n; i++) {
    if (!best[i] || best[i]!.partial) continue;
    for (let j = i + 1; j <= Math.min(n, i + 6); j++) {
      const piece = s.slice(i, j);
      const ok = valid.has(piece);
      const partial = !ok && j === n && !!prefixes?.has(piece);
      if (!ok && !partial) continue;
      const count = best[i]!.count + 1;
      if (!best[j] || count < best[j]!.count || (best[j]!.partial && !partial && count <= best[j]!.count)) {
        best[j] = { count, prev: i, partial };
      }
    }
  }
  if (!best[n]) return null;
  const parts: string[] = [];
  let k = n;
  while (k > 0) {
    const b = best[k]!;
    parts.unshift(s.slice(b.prev, k));
    k = b.prev;
  }
  return { parts, lastIsPartial: best[n]!.partial };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** heritage-speaker accent tolerance: z/zh, c/ch, s/sh, n/l, -n/-ng */
function fuzzyLetters(letters: string): string {
  let initial = '';
  let rest = letters;
  const m = /^(zh|ch|sh|z|c|s|n|l)/.exec(letters);
  if (m) {
    initial = { zh: 'zh?', z: 'zh?', ch: 'ch?', c: 'ch?', sh: 'sh?', s: 'sh?', n: '[nl]', l: '[nl]' }[m[1]!]!;
    rest = letters.slice(m[1]!.length);
  }
  if (/[aeiouv]ng$/.test(rest)) rest = escapeRe(rest.slice(0, -2)) + 'ng?';
  else if (/[aeiouv]n$/.test(rest)) rest = escapeRe(rest.slice(0, -1)) + 'ng?';
  else rest = escapeRe(rest);
  return initial + rest;
}

/** Builds a regex over toneKey() strings. `exact` anchors the end; `fuzzy` tolerates accent confusions. */
export function pinyinRegex(parsed: ParsedPinyin, opts: { exact: boolean; fuzzy: boolean }): RegExp {
  const parts = parsed.syllables.map((syl, i) => {
    const isLast = i === parsed.syllables.length - 1;
    const letters = opts.fuzzy ? fuzzyLetters(syl.letters) : escapeRe(syl.letters);
    if (isLast && parsed.lastIsPartial) return letters + '[a-z]*[1-5]?';
    // dictionary keys always carry a tone digit per syllable, so the digit marks the syllable boundary
    return letters + (syl.tone ? String(syl.tone) : '[1-5]');
  });
  return new RegExp('^' + parts.join('') + (opts.exact ? '$' : ''));
}
