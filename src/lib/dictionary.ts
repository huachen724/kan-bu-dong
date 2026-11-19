/**
 * Offline dictionary engine.
 *
 * Data: a small starter bundle (HSK 1 + every word used in the packs/readings) ships inside the app
 * (src/data/seed). The full CC-CEDICT bundle (public/data/*.json, built by `npm run data`) is
 * downloaded once in the background, stored in IndexedDB (Dexie `assets` table) and used offline after.
 * Entries are pre-sorted by frequency rank, so array index == rank and "first match" == "most common".
 */
import { useSyncExternalStore } from 'react';
import { db } from './db';
import { hasCJK, isCJKChar, parsePinyinQuery, pinyinRegex, toMarked, toneKey } from './pinyin';

type RawEntry = [string, string, string, string, number, number, string];
type RawChar = [string, string, number, string, string, string, string, string];
type RawSentence = [string, string];

export interface DictEntry {
  id: number;
  s: string;
  t: string;
  /** numbered pinyin straight from CC-CEDICT ("ni3 hao3") */
  p: string;
  d: string[];
  hsk: number;
  hsk3: number;
  pos: string;
}

export interface CharInfo {
  char: string;
  radical: string;
  decomposition: string;
  components: string[];
  strokes: number;
  definition: string;
  etymologyType: string;
  hint: string;
  semantic: string;
  phonetic: string;
}

export interface Token {
  text: string;
  cjk: boolean;
  entry: DictEntry | null;
}

export interface DictStatus {
  level: 'none' | 'seed' | 'full';
  loading: boolean;
  progress: number;
  entries: number;
  sentences: number;
  error?: string;
}

// ---------------------------------------------------------------- state
let raw: RawEntry[] = [];
let chars: Record<string, RawChar> = {};
let sentences: RawSentence[] = [];
let S: string[] = [];
let T: string[] = [];
let KEY: string[] = [];
let EN: string[] = [];
let LOW: Uint8Array = new Uint8Array(0);
let bySimp = new Map<string, number[]>();
let byTrad = new Map<string, number[]>();
let validSyllables = new Set<string>();
let syllablePrefixes = new Set<string>();
const entryCache = new Map<number, DictEntry>();

let status: DictStatus = { level: 'none', loading: false, progress: 0, entries: 0, sentences: 0 };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<DictStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export function useDictStatus(): DictStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}
export const getDictStatus = () => status;

function buildIndex(entries: RawEntry[]) {
  raw = entries;
  const n = entries.length;
  S = new Array(n);
  T = new Array(n);
  KEY = new Array(n);
  EN = new Array(n);
  LOW = new Uint8Array(n);
  bySimp = new Map();
  byTrad = new Map();
  validSyllables = new Set();
  entryCache.clear();
  for (let i = 0; i < n; i++) {
    const e = entries[i]!;
    const s = e[0];
    const t = e[1] || s;
    S[i] = s;
    T[i] = t;
    KEY[i] = toneKey(e[2]);
    EN[i] = e[3].toLowerCase();
    let list = bySimp.get(s);
    if (!list) bySimp.set(s, (list = []));
    list.push(i);
    if (t !== s) {
      let tl = byTrad.get(t);
      if (!tl) byTrad.set(t, (tl = []));
      tl.push(i);
    }
    const first = EN[i]!;
    const lowValue =
      !e[4] && !e[5] && (/^(old |archaic |japanese )?variant of|^see |^surname |^used in /.test(first) || e[2][0] !== e[2][0]!.toLowerCase());
    LOW[i] = lowValue ? 1 : 0;
    for (const syl of e[2].toLowerCase().replace(/u:/g, 'v').split(/\s+/)) {
      const letters = syl.replace(/[^a-z]/g, '');
      if (letters && letters.length <= 6 && /[1-5]$/.test(syl)) validSyllables.add(letters);
    }
  }
  syllablePrefixes = new Set();
  for (const syl of validSyllables) for (let k = 1; k <= syl.length; k++) syllablePrefixes.add(syl.slice(0, k));
}

export function getEntry(i: number): DictEntry {
  let e = entryCache.get(i);
  if (!e) {
    const r = raw[i]!;
    e = { id: i, s: r[0], t: r[1] || r[0], p: r[2], d: r[3].split('/'), hsk: r[4], hsk3: r[5], pos: r[6] };
    entryCache.set(i, e);
  }
  return e;
}

// ---------------------------------------------------------------- loading
let seedPromise: Promise<void> | null = null;
let fullPromise: Promise<void> | null = null;

export function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const [d, c, s] = await Promise.all([
        import('../data/seed/dict.json'),
        import('../data/seed/chars.json'),
        import('../data/seed/sentences.json'),
      ]);
      if (status.level === 'full') return;
      buildIndex(d.default as unknown as RawEntry[]);
      chars = c.default as unknown as Record<string, RawChar>;
      sentences = s.default as unknown as RawSentence[];
      setStatus({ level: 'seed', entries: raw.length, sentences: sentences.length });
    })();
  }
  return seedPromise;
}

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

async function fetchText(file: string, onProgress?: (f: number) => void): Promise<string> {
  const res = await fetch(DATA_BASE + file, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('text/html')) throw new Error(`${file} not found (run npm run data)`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    // content-length is the compressed size when gzip'd, so this is only an estimate
    onProgress(total ? Math.min(0.95, got / (total * 3.2)) : 0);
  }
  const all = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(all);
}

/** Loads the full dictionary: IndexedDB copy if current, otherwise downloads and stores it. */
export function ensureFull(force = false): Promise<void> {
  if (fullPromise && !force) return fullPromise;
  fullPromise = (async () => {
    await ensureSeed();
    setStatus({ loading: true, error: undefined, progress: 0 });
    try {
      const cached = await db.assets.get('dict');
      let version = cached?.version ?? '';
      let remoteVersion = '';
      if (navigator.onLine) {
        try {
          remoteVersion = JSON.parse(await fetchText('meta.json')).version as string;
        } catch {
          /* offline or no bundle deployed */
        }
      }
      let dictText: string, charText: string, sentText: string;
      if (cached && !force && (!remoteVersion || remoteVersion === version)) {
        dictText = cached.data;
        charText = (await db.assets.get('chars'))?.data ?? '{}';
        sentText = (await db.assets.get('sentences'))?.data ?? '[]';
      } else {
        if (!remoteVersion) throw new Error('Full dictionary not available offline yet');
        dictText = await fetchText('dict.json', (f) => setStatus({ progress: f * 0.75 }));
        charText = await fetchText('chars.json');
        setStatus({ progress: 0.82 });
        sentText = await fetchText('sentences.json').catch(() => '[]');
        setStatus({ progress: 0.9 });
        version = remoteVersion;
        await db.assets.bulkPut([
          { key: 'dict', version, data: dictText },
          { key: 'chars', version, data: charText },
          { key: 'sentences', version, data: sentText },
        ]);
      }
      buildIndex(JSON.parse(dictText) as RawEntry[]);
      chars = JSON.parse(charText);
      sentences = JSON.parse(sentText);
      setStatus({ level: 'full', loading: false, progress: 1, entries: raw.length, sentences: sentences.length });
    } catch (err) {
      setStatus({ loading: false, error: err instanceof Error ? err.message : String(err) });
      fullPromise = null;
    }
  })();
  return fullPromise;
}

// ---------------------------------------------------------------- lookups
export function lookup(word: string): DictEntry[] {
  const ids = [...(bySimp.get(word) ?? []), ...(byTrad.get(word) ?? [])];
  return [...new Set(ids)].sort((a, b) => a - b).map(getEntry);
}

/** Best entry for a word, optionally preferring a specific (numbered or marked) reading. */
export function primaryEntry(word: string, pinyin?: string): DictEntry | null {
  const list = lookup(word);
  if (!list.length) return null;
  if (pinyin) {
    const k = toneKey(pinyinToNumbered(pinyin));
    const hit = list.find((e) => toneKey(e.p) === k);
    if (hit) return hit;
  }
  return list[0]!;
}

export function hasWord(w: string): boolean {
  return bySimp.has(w) || byTrad.has(w);
}

export function charInfo(ch: string): CharInfo | null {
  const c = chars[ch];
  if (!c) return null;
  const components = [...c[1]].filter((x) => !/[\u2ff0-\u2fff？]/.test(x) && x !== ch);
  return {
    char: ch,
    radical: c[0],
    decomposition: c[1],
    components,
    strokes: c[2],
    definition: c[3],
    etymologyType: c[4],
    hint: c[5],
    semantic: c[6],
    phonetic: c[7],
  };
}

/** Character family: common words containing `ch`, most frequent first */
export function compounds(ch: string, limit = 24): DictEntry[] {
  const out: DictEntry[] = [];
  for (let i = 0; i < S.length && out.length < limit; i++) {
    if (LOW[i]) continue;
    if (S[i]!.length > 1 && S[i]!.length <= 4 && (S[i]!.includes(ch) || T[i]!.includes(ch))) {
      if (out.some((e) => e.s === S[i])) continue;
      out.push(getEntry(i));
    }
  }
  return out;
}

export function examples(word: string, limit = 5): { zh: string; en: string }[] {
  const simp = toSimplified(word);
  const hits: { zh: string; en: string }[] = [];
  for (const [zh, en] of sentences) {
    if (zh.includes(simp)) hits.push({ zh, en });
    if (hits.length >= 200) break;
  }
  // prefer short sentences where the word is a real word (not part of a longer one)
  return hits
    .map((h) => ({ h, score: h.zh.length + (segment(h.zh).some((t) => t.text === simp) ? 0 : 20) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.h);
}

/** All HSK 2.0 entries of a level, one per word, in frequency order */
export function hskWords(level: number): DictEntry[] {
  const seen = new Set<string>();
  const out: DictEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i]![4] === level && !seen.has(S[i]!)) {
      seen.add(S[i]!);
      out.push(getEntry(i));
    }
  }
  return out;
}

export function randomEntries(count: number, length: number, exclude: Set<string>): DictEntry[] {
  const out: DictEntry[] = [];
  const pool = Math.min(raw.length, 3000);
  for (let tries = 0; tries < 400 && out.length < count; tries++) {
    const i = Math.floor(Math.random() * pool);
    if (LOW[i] || S[i]!.length !== length || exclude.has(S[i]!)) continue;
    exclude.add(S[i]!);
    out.push(getEntry(i));
  }
  return out;
}

// ---------------------------------------------------------------- segmentation & conversion
const MAX_WORD = 8;

function wordCost(w: string): number {
  const s = bySimp.get(w)?.[0];
  const t = byTrad.get(w)?.[0];
  const rank = Math.min(s ?? Infinity, t ?? Infinity);
  if (rank === Infinity) return w.length === 1 ? Math.log(raw.length + 50) + 3 : Infinity;
  return Math.log(rank + 50);
}

/** Splits a run of Chinese characters into words: unigram DP where common words are cheap (rank ≈ frequency). */
function segmentRun(run: string[]): string[] {
  const n = run.length;
  const cost = new Array<number>(n + 1).fill(Infinity);
  const back = new Array<number>(n + 1).fill(0);
  cost[0] = 0;
  for (let i = 0; i < n; i++) {
    if (cost[i] === Infinity) continue;
    for (let len = 1; len <= Math.min(MAX_WORD, n - i); len++) {
      const c = cost[i]! + wordCost(run.slice(i, i + len).join(''));
      if (c < cost[i + len]!) {
        cost[i + len] = c;
        back[i + len] = i;
      }
    }
  }
  const words: string[] = [];
  for (let k = n; k > 0; k = back[k]!) words.unshift(run.slice(back[k]!, k).join(''));
  return words;
}

/** Tokenises text into dictionary words (simplified or traditional input) and non-Chinese runs. */
export function segment(text: string): Token[] {
  const chs = [...text];
  const out: Token[] = [];
  let i = 0;
  while (i < chs.length) {
    const cjk = isCJKChar(chs[i]!);
    let j = i;
    while (j < chs.length && isCJKChar(chs[j]!) === cjk) j++;
    if (!cjk) out.push({ text: chs.slice(i, j).join(''), cjk: false, entry: null });
    else for (const w of segmentRun(chs.slice(i, j))) out.push({ text: w, cjk: true, entry: primaryEntry(w) });
    i = j;
  }
  return out;
}

function convertWord(tok: Token, to: 'trad' | 'simp'): string {
  if (!tok.cjk) return tok.text;
  const e = tok.entry;
  if (e && (e.s === tok.text || e.t === tok.text)) return to === 'trad' ? e.t : e.s;
  return [...tok.text]
    .map((ch) => {
      const ce = primaryEntry(ch);
      return ce ? (to === 'trad' ? ce.t : ce.s) : ch;
    })
    .join('');
}

export function toTraditional(text: string): string {
  return segment(text)
    .map((t) => convertWord(t, 'trad'))
    .join('');
}

export function toSimplified(text: string): string {
  if (!hasCJK(text)) return text;
  return segment(text)
    .map((t) => convertWord(t, 'simp'))
    .join('');
}

/** Numbered pinyin for running text, word by word (uses the most common reading of each word) */
export function pinyinForText(text: string): string {
  return segment(text)
    .filter((t) => t.cjk)
    .map((t) => t.entry?.p ?? '')
    .join(' ')
    .trim();
}

export function pinyinToNumbered(p: string): string {
  if (/[0-5]/.test(p)) return p;
  const MARKS = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
  const BASE = 'aaaaeeeeiiiioooouuuuvvvv';
  return p
    .split(/\s+/)
    .map((syl) => {
      let tone = 5;
      let out = '';
      for (const ch of syl) {
        const k = MARKS.indexOf(ch);
        if (k >= 0) {
          tone = (k % 4) + 1;
          out += BASE[k];
        } else out += ch === 'ü' ? 'v' : ch;
      }
      return out ? out + tone : out;
    })
    .join(' ');
}

// ---------------------------------------------------------------- search
export interface SearchResult {
  entries: DictEntry[];
  /** for multi-word Chinese input: the words it breaks into */
  breakdown: Token[];
  kind: 'hanzi' | 'pinyin' | 'english' | 'mixed' | 'empty';
}

const STRIP_DEF = /\([^)]*\)|\[[^\]]*\]|^to |^a |^an |^the /g;

function englishTier(i: number, q: string, wordRe: RegExp): number {
  const en = EN[i]!;
  if (!en.includes(q)) return -1;
  let tier = 9;
  for (const def of en.split('/')) {
    for (const sub of def.split(';')) {
      const clean = sub.replace(STRIP_DEF, '').trim();
      if (clean === q) return LOW[i] ? 3 : 0;
      if (clean.startsWith(q + ' ') || clean.startsWith(q + ',')) tier = Math.min(tier, 1);
      else if (wordRe.test(sub)) tier = Math.min(tier, 2);
    }
  }
  if (tier === 9) return -1;
  return tier + (LOW[i] ? 3 : 0);
}

export function search(query: string, limit = 60): SearchResult {
  const q = query.trim();
  if (!q) return { entries: [], breakdown: [], kind: 'empty' };

  if (hasCJK(q)) {
    const tiers: number[][] = [[], [], []];
    for (const id of [...(bySimp.get(q) ?? []), ...(byTrad.get(q) ?? [])]) tiers[0]!.push(id);
    for (let i = 0; i < S.length; i++) {
      if (tiers[1]!.length >= limit && tiers[2]!.length >= limit) break;
      if (S[i] === q || T[i] === q) continue;
      if (S[i]!.startsWith(q) || T[i]!.startsWith(q)) {
        if (tiers[1]!.length < limit) tiers[1]!.push(i);
      } else if (S[i]!.includes(q) || T[i]!.includes(q)) {
        if (tiers[2]!.length < limit && !LOW[i]) tiers[2]!.push(i);
      }
    }
    const ids = [...new Set([...tiers[0]!.sort((a, b) => a - b), ...tiers[1]!, ...tiers[2]!])].slice(0, limit);
    const breakdown = [...q].length > 1 ? segment(q).filter((t) => t.cjk) : [];
    const needsBreakdown = breakdown.length > 1;
    return { entries: ids.map(getEntry), breakdown: needsBreakdown ? breakdown : [], kind: 'hanzi' };
  }

  const lower = q.toLowerCase();
  const parsed = parsePinyinQuery(q, validSyllables, syllablePrefixes);
  const pinyinTiers: number[][] = [[], [], [], []];
  if (parsed) {
    const exact = pinyinRegex(parsed, { exact: true, fuzzy: false });
    const prefix = pinyinRegex(parsed, { exact: false, fuzzy: false });
    for (let i = 0; i < KEY.length; i++) {
      const k = KEY[i]!;
      if (exact.test(k)) pinyinTiers[LOW[i] ? 2 : 0]!.push(i);
      else if (pinyinTiers[1]!.length < limit && prefix.test(k)) pinyinTiers[LOW[i] ? 3 : 1]!.push(i);
    }
    if (pinyinTiers[0]!.length + pinyinTiers[1]!.length < 8) {
      const fExact = pinyinRegex(parsed, { exact: true, fuzzy: true });
      const fPrefix = pinyinRegex(parsed, { exact: false, fuzzy: true });
      for (let i = 0; i < KEY.length && pinyinTiers[2]!.length < limit; i++) {
        if (LOW[i]) continue;
        const k = KEY[i]!;
        if (exact.test(k) || prefix.test(k)) continue;
        if (fExact.test(k) || fPrefix.test(k)) pinyinTiers[2]!.push(i);
      }
    }
  }

  const englishTiers: number[][] = [[], [], [], [], [], []];
  const looksEnglish = !/[0-5āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(q);
  if (looksEnglish && lower.length >= 2) {
    const wordRe = new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    for (let i = 0; i < EN.length; i++) {
      const tier = englishTier(i, lower, wordRe);
      if (tier >= 0 && englishTiers[tier]!.length < limit) englishTiers[tier]!.push(i);
    }
  }

  // interleave by tier so "he" shows both 喝 (pinyin) and 他 (English) near the top
  const order: number[] = [];
  const singleSyllable = parsed?.syllables.length === 1;
  const tiersOrdered = [
    pinyinTiers[0]!,
    englishTiers[0]!,
    singleSyllable ? englishTiers[1]! : pinyinTiers[1]!,
    singleSyllable ? pinyinTiers[1]! : englishTiers[1]!,
    englishTiers[2]!,
    pinyinTiers[2]!,
    englishTiers[3]!,
    englishTiers[4]!,
    pinyinTiers[3]!,
    englishTiers[5]!,
  ];
  for (const t of tiersOrdered) order.push(...t);
  const ids = [...new Set(order)].slice(0, limit);
  const hasPinyin = pinyinTiers.some((t) => t.length);
  const hasEnglish = englishTiers.some((t) => t.length);
  return {
    entries: ids.map(getEntry),
    breakdown: [],
    kind: hasPinyin && hasEnglish ? 'mixed' : hasPinyin ? 'pinyin' : 'english',
  };
}

// ---------------------------------------------------------------- display helpers
const POS: Record<string, string> = {
  n: 'noun', v: 'verb', a: 'adjective', d: 'adverb', m: 'numeral', q: 'measure word', r: 'pronoun',
  p: 'preposition', c: 'conjunction', u: 'particle', e: 'interjection', y: 'modal particle', o: 'onomatopoeia',
  t: 'time word', f: 'locative', s: 'place word', nr: 'name', ns: 'place name', nz: 'proper noun',
  vn: 'verbal noun', an: 'adj. noun', ad: 'adverbial adj.', i: 'idiom', l: 'set phrase', b: 'attributive',
  k: 'suffix', h: 'prefix', mq: 'quantity', g: 'bound morpheme', x: 'other',
};

export function posLabel(pos: string): string {
  return pos
    .split(',')
    .map((p) => POS[p])
    .filter((p): p is string => !!p && p !== 'bound morpheme')
    .slice(0, 3)
    .join(' · ');
}

/** Definitions without classifier noise; classifiers returned separately */
export function cleanDefs(e: DictEntry): { defs: string[]; classifiers: string } {
  const defs: string[] = [];
  let classifiers = '';
  for (const d of e.d) {
    if (d.startsWith('CL:'))
      classifiers = d
        .slice(3)
        .replace(/[^,|[\]]+\|/g, '') // "臺|台[tai2]" → "台[tai2]" (CC-CEDICT writes trad|simp)
        .replace(/\[[^\]]+\]/g, (m) => ` ${toMarked(m.slice(1, -1))}`)
        .replace(/,/g, ', ');
    else defs.push(d.replace(/\[([^\]]+)\]/g, (_, p: string) => `[${toMarked(p)}]`));
  }
  return { defs, classifiers };
}

export function shortDefinition(e: DictEntry, max = 3): string {
  return cleanDefs(e).defs.slice(0, max).join('; ');
}
