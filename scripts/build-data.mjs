#!/usr/bin/env node
/**
 * Downloads, parses and bundles the open dictionary data used by the app.
 *
 *   npm run data              build public/data/* (full offline bundle) + src/data/seed/* (starter bundle)
 *   npm run data -- --refresh re-download every source instead of using .cache/sources
 *   npm run data -- --no-sentences   skip Tatoeba (much faster, no example sentences)
 *   npm run data -- --supabase       additionally upsert dictionary_entries + example_sentences
 *                                    into Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *
 * Sources (all free / open licensed — see README "Data & licenses"):
 *   CC-CEDICT (CC BY-SA 4.0)                 dictionary entries
 *   complete-hsk-vocabulary (MIT)            HSK 2.0 + 3.0 levels, part of speech, frequency rank
 *   Make Me a Hanzi (LGPL / Arphic PL)       radical, decomposition, etymology, stroke count
 *   Tatoeba (CC BY 2.0 FR)                   example sentences with English translations
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Bunzip from 'seek-bzip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'sources');
const OUT = path.join(ROOT, 'public', 'data');
const SEED = path.join(ROOT, 'src', 'data', 'seed');
const CONTENT_DIR = path.join(ROOT, 'src', 'data');

const args = new Set(process.argv.slice(2));
const REFRESH = args.has('--refresh');
const WITH_SENTENCES = !args.has('--no-sentences');
const TO_SUPABASE = args.has('--supabase');

const SOURCES = {
  cedict: 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz',
  hsk: 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json',
  mmahDict: 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt',
  mmahGraphics: 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt',
  tatoebaCmn: 'https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences.tsv.bz2',
  tatoebaLinks: 'https://downloads.tatoeba.org/exports/per_language/cmn/cmn-eng_links.tsv.bz2',
  tatoebaEng: 'https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2',
};

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_G = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const MAX_WORD = 8;

function log(...m) {
  console.log('[data]', ...m);
}

async function fetchSource(name) {
  const url = SOURCES[name];
  const file = path.join(CACHE, path.basename(new URL(url).pathname));
  if (!REFRESH && fs.existsSync(file) && fs.statSync(file).size > 1000) return fs.readFileSync(file);
  fs.mkdirSync(CACHE, { recursive: true });
  log(`downloading ${name} …`);
  const res = await fetch(url, { headers: { 'User-Agent': 'kan-bu-dong-data-script/1.0' } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

function decode(name, buf) {
  if (name.endsWith('.gz') || (buf[0] === 0x1f && buf[1] === 0x8b)) return zlib.gunzipSync(buf).toString('utf8');
  if (buf[0] === 0x42 && buf[1] === 0x5a && buf[2] === 0x68) return Bunzip.decode(buf).toString('utf8');
  return buf.toString('utf8');
}

async function loadText(name) {
  return decode(SOURCES[name], await fetchSource(name));
}

/** lowercase, ü/u: → v, drop spaces/punctuation; keeps tone digits */
function normPinyin(p) {
  return p
    .toLowerCase()
    .replace(/u:/g, 'v')
    .replace(/ü/g, 'v')
    .replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------- CC-CEDICT
async function parseCedict() {
  const text = await loadText('cedict');
  const re = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s+\/(.*)\/\s*$/;
  const entries = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = re.exec(line.trim());
    if (!m) continue;
    const [, t, s, p, defs] = m;
    entries.push({
      t,
      s,
      p: p.replace(/u:/g, 'v').replace(/\s+/g, ' ').trim(),
      d: defs.split('/').map((x) => x.trim()).filter(Boolean),
      hsk: 0,
      hsk3: 0,
      freq: 0,
      pos: '',
      order: entries.length,
    });
  }
  log(`CC-CEDICT: ${entries.length} entries`);
  return entries;
}

// ---------------------------------------------------------------- HSK
async function applyHsk(entries) {
  const list = JSON.parse(await loadText('hsk'));
  const bySimp = new Map();
  for (const e of entries) {
    if (!bySimp.has(e.s)) bySimp.set(e.s, []);
    bySimp.get(e.s).push(e);
  }
  let tagged = 0;
  let added = 0;
  for (const w of list) {
    let hsk = 0;
    let hsk3 = 0;
    let newest = 0;
    for (const lv of w.level ?? []) {
      const [kind, n] = lv.split('-');
      const num = Number(n);
      if (kind === 'old' && (!hsk || num < hsk)) hsk = num;
      if (kind === 'new' && (!hsk3 || num < hsk3)) hsk3 = num;
      if (kind === 'newest' && (!newest || num < newest)) newest = num;
    }
    if (!hsk3) hsk3 = newest;
    const pos = (w.pos ?? []).join(',');
    const freq = Number(w.frequency) || 0;
    const candidates = bySimp.get(w.simplified) ?? [];
    let matched = false;
    for (const form of w.forms ?? []) {
      const num = normPinyin(form.transcriptions?.numeric ?? '');
      const noFive = num.replace(/5/g, '');
      for (const e of candidates) {
        const ep = normPinyin(e.p);
        if (ep === num || ep.replace(/5/g, '') === noFive) {
          tag(e);
          matched = true;
        }
      }
    }
    if (!matched) {
      const lower = candidates.filter((e) => e.p[0] === e.p[0]?.toLowerCase());
      if (lower.length) lower.forEach(tag);
      else if (candidates.length) candidates.forEach(tag);
      else {
        for (const form of w.forms ?? []) {
          const e = {
            t: form.traditional || w.simplified,
            s: w.simplified,
            p: (form.transcriptions?.numeric ?? '').replace(/u:/g, 'v'),
            d: form.meanings ?? [],
            hsk: 0,
            hsk3: 0,
            freq: 0,
            pos: '',
            order: entries.length,
          };
          if (!e.p || !e.d.length) continue;
          entries.push(e);
          tag(e);
          added++;
        }
      }
    }
    function tag(e) {
      if (hsk && (!e.hsk || hsk < e.hsk)) e.hsk = hsk;
      if (hsk3 && (!e.hsk3 || hsk3 < e.hsk3)) e.hsk3 = hsk3;
      if (freq && (!e.freq || freq < e.freq)) e.freq = freq;
      if (pos && !e.pos) e.pos = pos;
      tagged++;
    }
  }
  log(`HSK: ${list.length} words → tagged ${tagged} entries, added ${added} missing entries`);
}

// ---------------------------------------------------------------- Make Me a Hanzi
async function parseChars() {
  const dict = await loadText('mmahDict');
  const graphics = await loadText('mmahGraphics');
  const strokes = new Map();
  for (const line of graphics.split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line);
    strokes.set(g.character, g.strokes.length);
  }
  const chars = {};
  for (const line of dict.split('\n')) {
    if (!line.trim()) continue;
    const c = JSON.parse(line);
    const def = (c.definition ?? '').split(/[;,]/)[0].trim().slice(0, 40);
    const ety = c.etymology ?? {};
    const hint = (ety.hint ?? '').slice(0, 120);
    // [radical, decomposition, strokeCount, shortDefinition, etymologyType, etymologyHint, semantic, phonetic]
    chars[c.character] = [
      c.radical ?? '',
      c.decomposition ?? '',
      strokes.get(c.character) ?? 0,
      def,
      ety.type ?? '',
      hint,
      ety.semantic ?? '',
      ety.phonetic ?? '',
    ];
  }
  log(`Make Me a Hanzi: ${Object.keys(chars).length} characters`);
  return chars;
}

// ---------------------------------------------------------------- segmentation helper
function makeSegmenter(words) {
  return function segment(text) {
    const out = [];
    let i = 0;
    const chars = [...text];
    while (i < chars.length) {
      if (!CJK.test(chars[i])) {
        i++;
        continue;
      }
      let len = Math.min(MAX_WORD, chars.length - i);
      for (; len > 1; len--) {
        if (words.has(chars.slice(i, i + len).join(''))) break;
      }
      out.push(chars.slice(i, i + len).join(''));
      i += len;
    }
    return out;
  };
}

// ---------------------------------------------------------------- Tatoeba
async function parseSentences(t2s) {
  const cmnText = await loadText('tatoebaCmn');
  const linksText = await loadText('tatoebaLinks');
  const cmn = new Map();
  for (const line of cmnText.split('\n')) {
    const [id, , text] = line.split('\t');
    if (id && text) cmn.set(id, text.trim());
  }
  const links = new Map();
  for (const line of linksText.split('\n')) {
    const [a, b] = line.split('\t');
    if (a && b && cmn.has(a) && !links.has(a)) links.set(a, b.trim());
  }
  const needed = new Set(links.values());
  log(`Tatoeba: ${cmn.size} Mandarin sentences, ${links.size} with English links — decoding English export …`);
  const engText = await loadText('tatoebaEng');
  const eng = new Map();
  let start = 0;
  while (start < engText.length) {
    let end = engText.indexOf('\n', start);
    if (end === -1) end = engText.length;
    const tab = engText.indexOf('\t', start);
    if (tab > start && tab < end) {
      const id = engText.slice(start, tab);
      if (needed.has(id)) {
        const tab2 = engText.indexOf('\t', tab + 1);
        eng.set(id, engText.slice(tab2 + 1, end).trim());
      }
    }
    start = end + 1;
  }
  const seen = new Set();
  const sentences = [];
  for (const [id, text] of cmn) {
    const en = eng.get(links.get(id));
    if (!en) continue;
    const cjkLen = (text.match(CJK_G) ?? []).length;
    if (cjkLen < 3 || cjkLen > 20 || /[A-Za-z]{3,}/.test(text)) continue;
    const simp = [...text].map((ch) => t2s.get(ch) ?? ch).join('');
    if (seen.has(simp)) continue;
    seen.add(simp);
    sentences.push({ id: Number(id), zh: simp, en });
  }
  sentences.sort((a, b) => a.id - b.id);
  log(`Tatoeba: kept ${sentences.length} sentence pairs`);
  return sentences;
}

// ---------------------------------------------------------------- ranking
function isLowValue(e) {
  const first = e.d[0] ?? '';
  if (/^(old |archaic |Japanese )?variant of|^see |^surname |^used in |^\(old\)|^\(literary\)/i.test(first) && e.d.length <= 2) return true;
  if (e.hsk || e.hsk3) return false;
  return e.p[0] !== e.p[0].toLowerCase(); // proper nouns (capitalised pinyin)
}

/**
 * The HSK list gives every reading of a polyphone the same frequency (和 hé / hè / huó …).
 * Keep that frequency for the main reading only, so rare readings don't crowd search results.
 */
function demoteSecondaryReadings(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.s)) groups.set(e.s, []);
    groups.get(e.s).push(e);
  }
  for (const members of groups.values()) {
    if (members.length < 2 || !members.some((e) => e.freq)) continue;
    const isLower = (e) => e.p[0] === e.p[0].toLowerCase();
    const main =
      members.find((e) => e.primary && !isLowValue(e)) ??
      [...members].filter((e) => !isLowValue(e) && isLower(e)).sort((a, b) => b.d.length - a.d.length || a.order - b.order)[0] ??
      members[0];
    for (const e of members) if (e !== main && e.freq) e.freq += 30000;
  }
}

/**
 * Most common reading of frequent polyphones. The app picks the first (lowest-rank) entry of a word
 * when it auto-generates pinyin for running text, so this decides e.g. 了 → le, 还 → hái.
 */
const PRIMARY_READING = {
  了: 'le5', 的: 'de5', 得: 'de5', 着: 'zhe5', 地: 'de5', 说: 'shuo1', 行: 'xing2', 长: 'chang2', 还: 'hai2',
  都: 'dou1', 要: 'yao4', 好: 'hao3', 为: 'wei4', 和: 'he2', 只: 'zhi3', 重: 'zhong4', 发: 'fa1', 干: 'gan4',
  觉: 'jue2', 便: 'bian4', 种: 'zhong3', 教: 'jiao1', 乐: 'le4', 少: 'shao3', 没: 'mei2', 当: 'dang1',
  相: 'xiang1', 数: 'shu4', 差: 'cha4', 难: 'nan2', 看: 'kan4', 中: 'zhong1', 会: 'hui4', 过: 'guo4',
  处: 'chu4', 调: 'diao4', 空: 'kong1', 分: 'fen1', 正: 'zheng4', 应: 'ying1', 量: 'liang4', 角: 'jiao3',
  传: 'chuan2', 背: 'bei4', 朝: 'chao2', 吗: 'ma5', 呢: 'ne5', 吧: 'ba5', 啊: 'a5', 么: 'me5', 一: 'yi1',
  不: 'bu4', 那: 'na4', 哪: 'na3', 大: 'da4', 家: 'jia1', 将: 'jiang1', 结: 'jie2', 系: 'xi4', 给: 'gei3',
  什: 'shen2', 解: 'jie3', 期: 'qi1', 省: 'sheng3', 血: 'xue4', 尽: 'jin4', 担: 'dan1', 曾: 'ceng2',
  识: 'shi2', 冲: 'chong1', 似: 'si4', 们: 'men5', 个: 'ge4', 子: 'zi5', 头: 'tou2', 车: 'che1', 号: 'hao4',
  奶: 'nai3', 爸: 'ba4', 妈: 'ma1', 哥: 'ge1', 弟: 'di4', 姐: 'jie3', 妹: 'mei4', 喝: 'he1', 吃: 'chi1',
  做: 'zuo4', 睡: 'shui4', 笼: 'long2', 啦: 'la5', 觉得: 'jue2 de5', 东西: 'dong1 xi5', 地方: 'di4 fang5', 什么: 'shen2 me5',
};

function rankEntries(entries, counts) {
  for (const e of entries) {
    e.count = counts.get(e.s) ?? 0;
    e.cat = e.freq ? 0 : e.count > 0 ? 1 : 2;
    if (isLowValue(e)) e.cat += 3;
    const primary = PRIMARY_READING[e.s];
    e.primary = primary ? normPinyin(e.p) === normPinyin(primary) : false;
  }
  demoteSecondaryReadings(entries);
  entries.sort((a, b) => {
    if (a.cat !== b.cat) return a.cat - b.cat;
    if (a.cat % 3 === 0 && a.freq !== b.freq) return a.freq - b.freq;
    if (a.count !== b.count) return b.count - a.count;
    if (a.s === b.s && a.d.length !== b.d.length) return b.d.length - a.d.length;
    if (a.s.length !== b.s.length) return a.s.length - b.s.length;
    return a.order - b.order;
  });
  // within each word, the entry in the earliest slot is what the app shows for running text:
  // prefer the curated primary reading, otherwise a common-noun (lowercase) entry over a proper noun
  const groups = new Map();
  entries.forEach((e, i) => {
    if (!groups.has(e.s)) groups.set(e.s, []);
    groups.get(e.s).push(i);
  });
  for (const slots of groups.values()) {
    if (slots.length < 2) continue;
    const members = slots.map((i) => entries[i]);
    const isLower = (e) => e.p[0] === e.p[0].toLowerCase();
    let best = members.findIndex((e) => e.primary);
    if (best < 0 && !isLower(members[0])) best = members.findIndex(isLower);
    if (best > 0) {
      const [chosen] = members.splice(best, 1);
      members.unshift(chosen);
      slots.forEach((slot, k) => (entries[slot] = members[k]));
    }
  }
}

/** compact format consumed by src/lib/dictionary.ts — index in the array == frequency rank */
function packEntry(e) {
  return [e.s, e.t === e.s ? '' : e.t, e.p, e.d.join('/'), e.hsk, e.hsk3, e.pos];
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = JSON.stringify(data);
  fs.writeFileSync(file, json);
  log(`wrote ${path.relative(ROOT, file)} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);
}

// ---------------------------------------------------------------- seed (starter bundle committed to git)
function collectContentText() {
  if (!fs.existsSync(CONTENT_DIR)) return '';
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => /\.(ts|tsx)$/.test(f));
  return files.map((f) => fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8')).join('\n');
}

function buildSeed(entries, chars, sentences, segmentAny) {
  const pick = new Set();
  const bySimp = new Map();
  const byTrad = new Map();
  entries.forEach((e, i) => {
    if (!bySimp.has(e.s)) bySimp.set(e.s, []);
    bySimp.get(e.s).push(i);
    if (!byTrad.has(e.t)) byTrad.set(e.t, []);
    byTrad.get(e.t).push(i);
  });
  const addWord = (w, max = 4) => {
    for (const i of (bySimp.get(w) ?? byTrad.get(w) ?? []).slice(0, max)) pick.add(i);
  };
  entries.forEach((e, i) => {
    if (e.hsk === 1 || e.hsk3 === 1) pick.add(i);
  });
  const content = collectContentText();
  const runs = content.match(/[\u3400-\u4dbf\u4e00-\u9fff]+/g) ?? [];
  for (const run of runs) for (const w of segmentAny(run)) addWord(w);
  // every character of every picked word, so character breakdowns work offline
  for (const i of [...pick]) for (const ch of entries[i].s) if (CJK.test(ch)) addWord(ch, 2);

  const idx = [...pick].sort((a, b) => a - b);
  const seedEntries = idx.map((i) => packEntry(entries[i]));
  const seedWords = new Set(idx.map((i) => entries[i].s));
  const seedChars = {};
  for (const i of idx) for (const ch of entries[i].s + entries[i].t) if (chars[ch]) seedChars[ch] = chars[ch];
  const segS = makeSegmenter(seedWords);
  const seedSentences = sentences
    .filter((x) => {
      const n = (x.zh.match(CJK_G) ?? []).length;
      return n >= 4 && n <= 14 && segS(x.zh).every((w) => seedWords.has(w));
    })
    .slice(0, 600)
    .map((x) => [x.zh, x.en]);
  writeJson(path.join(SEED, 'dict.json'), seedEntries);
  writeJson(path.join(SEED, 'chars.json'), seedChars);
  writeJson(path.join(SEED, 'sentences.json'), seedSentences);
  log(`seed: ${seedEntries.length} entries, ${Object.keys(seedChars).length} chars, ${seedSentences.length} sentences`);
}

// ---------------------------------------------------------------- Supabase (optional)
async function upsertSupabase(table, rows, onConflict) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('--supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars');
  const BATCH = 2000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows.slice(i, i + BATCH)),
    });
    if (!res.ok) throw new Error(`Supabase ${table}: HTTP ${res.status} ${await res.text()}`);
    process.stdout.write(`\r[data] supabase ${table}: ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
}

// ---------------------------------------------------------------- main
async function main() {
  const t0 = Date.now();
  const entries = await parseCedict();
  await applyHsk(entries);
  const chars = await parseChars();

  const t2s = new Map();
  for (const e of entries) {
    if (e.t.length === 1 && e.s.length === 1 && e.t !== e.s && !t2s.has(e.t)) t2s.set(e.t, e.s);
  }

  const simpWords = new Set(entries.map((e) => e.s));
  const allWords = new Set([...simpWords, ...entries.map((e) => e.t)]);
  const segment = makeSegmenter(simpWords);

  let sentences = [];
  const counts = new Map();
  if (WITH_SENTENCES) {
    sentences = await parseSentences(t2s);
    for (const s of sentences) for (const w of segment(s.zh)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }

  rankEntries(entries, counts);

  const dictJson = entries.map(packEntry);
  writeJson(path.join(OUT, 'dict.json'), dictJson);
  writeJson(path.join(OUT, 'chars.json'), chars);
  if (WITH_SENTENCES) writeJson(path.join(OUT, 'sentences.json'), sentences.map((s) => [s.zh, s.en]));
  const meta = {
    // content hash: devices re-download only when the data actually changed
    version: crypto.createHash('sha1').update(JSON.stringify(dictJson)).update(String(sentences.length)).digest('hex').slice(0, 12),
    builtAt: new Date().toISOString(),
    entries: entries.length,
    chars: Object.keys(chars).length,
    sentences: sentences.length,
    sources: SOURCES,
  };
  writeJson(path.join(OUT, 'meta.json'), meta);

  buildSeed(entries, chars, sentences, makeSegmenter(allWords));

  if (TO_SUPABASE) {
    await upsertSupabase(
      'dictionary_entries',
      entries.map((e, i) => ({
        id: i + 1,
        simplified: e.s,
        traditional: e.t,
        pinyin: e.p,
        definitions: e.d,
        hsk_level: e.hsk || null,
        hsk3_level: e.hsk3 || null,
        part_of_speech: e.pos || null,
        frequency_rank: i + 1,
      })),
      'id',
    );
    // packs are authored in TypeScript; Node ≥ 23.6 strips the types on import
    const { PACKS } = await import(new URL('../src/data/packs.ts', import.meta.url).href);
    await upsertSupabase(
      'vocab_packs',
      PACKS.map((p, i) => ({ id: p.id, title: p.title, title_zh: p.zh, description: p.blurb, sort_order: i })),
      'id',
    );
    await upsertSupabase(
      'pack_items',
      PACKS.flatMap((p) =>
        p.words.map((w, i) => ({
          pack_id: p.id,
          position: i,
          character: w.s,
          pinyin: w.p,
          definition: w.e,
          example_zh: w.ex?.[0] ?? null,
          example_en: w.ex?.[1] ?? null,
        })),
      ),
      'pack_id,position',
    );
    await upsertSupabase(
      'example_sentences',
      sentences.map((s) => ({ id: s.id, chinese: s.zh, english: s.en, source: 'tatoeba' })),
      'id',
    );
  }
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
