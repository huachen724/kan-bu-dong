# 看不懂 · Kàn bù dǒng

A mobile-first, installable, offline-capable PWA for **heritage Mandarin speakers**, people who grew up *speaking*
Chinese at home but never learned to read or write it. Instead of starting from "hello, my name is…", it bridges
what you can already **say** to recognizing, reading and writing the characters for it, then expands outward
into school, work, emotions, slang and idioms.

It grew out of the original `chinese-flashcards` app and keeps all of that app's functionality (see
[Changelog](#changelog-original--now)).

| | |
|---|---|
| **Dictionary** (Pleco-style) | 125k-entry CC-CEDICT, offline. Search by 汉字, `ni hao` / `nǐ hǎo` / `ni3 hao3` / `nihao`, or English. Accent-tolerant fuzzy pinyin (z/zh, c/ch, s/sh, n/l, -n/-ng). HSK 2.0 + 3.0 badges, part of speech, radical + components + etymology, stroke count, animated stroke order, Tatoeba + authored example sentences with pinyin ruby, audio, character families (电 → 电脑, 电话, 电影 …), and one-tap **Add to Flashcards** everywhere. |
| **Flashcards + FSRS** | Your original decks plus starter decks (HSK 1–6, 10 domain packs). FSRS scheduling (`ts-fsrs`) with Again / Hard / Good / Easy and interval previews. Four quiz modes per card (Reading, Writing, Listening, Meaning), each with its **own** schedule. Daily queue, new-words-per-day limit, a learn-again step for failed cards in the same session. The original "Quick run-through" study mode is kept. |
| **Handwriting** (Skritter-style) | Built into the Writing quiz mode. Full-width 田字格 / 米字格 pad with page scroll locked. **Trace** (ghost + stroke-by-stroke guidance), **Quiz** (from memory, then side-by-side with the real stroke order, self-graded), **Stroke check** (hanzi-writer checks every stroke; hint on demand only), **Free write** (undo / redo / clear). Attempts are saved and pass/fail feeds the SRS. |
| **Domain packs** (Drops-style) | Home & Family → Food & Dim Sum → Feelings → School → Health → Money → Travel → Work → Texting & Slang → Idioms. Each pack: learn → auto-generated flashcards → mini reading → writing practice, plus a "heritage bridge" tip. |
| **Reading** | 14 graded texts: WeChat chats, a dim sum menu, supermarket and airport signs, dialogues (interpreting for Mom at the doctor, a New Year visit …). Tap **any** word for a dictionary popup without leaving the page. Toggle characters only / + pinyin ruby / + English. |
| **Extras** | **Speak → Characters** (say a phrase in Mandarin and see how it's written, word by word), **Radical Trainer** (40 radicals + quiz), **Family Talk** (respectful phrases for parents and grandparents), and a dashboard with streak, XP, daily goal, characters known, words mastered and % per domain. |
| **Platform** | Simplified ⇄ Traditional everywhere. Pinyin can be always shown, tap-to-reveal or hidden. Tone colors. Dark mode. Guest mode with no account; optional Supabase sign-in (email magic link + Google) for sync. JSON backup / restore. |

---

## Quick start

```bash
cd kan-bu-dong
npm install
npm run data      # downloads + builds the full offline dictionary (≈10 s after the first download)
npm run dev       # http://localhost:5173/kan-bu-dong/
```

`npm run data` is optional for local development. The app ships with a **starter dictionary** in `src/data/seed/`
(HSK 1 + HSK 3.0 band 1, plus every word used in the packs, readings and phrases, about 1.8k entries with
characters and sentences), so it is fully testable on day one even without running it. When `public/data/` is
missing, the app stays on the starter set and shows a banner.

Production build / preview:

```bash
npm run build && npm run preview   # http://localhost:4173/kan-bu-dong/
```

Install it on a phone: open the deployed URL, then **Share → Add to Home Screen** (iOS) or **Install app** (Android Chrome).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build + service worker |
| `npm run data` | Download (cached in `.cache/sources`), parse and bundle CC-CEDICT + HSK + Make Me a Hanzi + Tatoeba → `public/data/*.json`, and regenerate the committed starter bundle `src/data/seed/*.json` |
| `npm run data:fast` | Same, without Tatoeba sentences (skips the 25 MB English export) |
| `npm run data -- --refresh` | Force re-download of every source |
| `npm run data:supabase` | Also upsert `dictionary_entries`, `example_sentences`, `vocab_packs`, `pack_items` into Supabase (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) |

Requires **Node 20+**. Node 24 is recommended, and is required for `data:supabase` because it imports
`src/data/packs.ts` directly. CI uses Node 24.

---

## Environment variables & API keys

Nothing is required. Everything runs on free tiers or entirely in the browser:

| Variable | Where | Needed for |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` / GitHub secret | Optional: sign-in + cloud sync |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` / GitHub secret | Optional: sign-in + cloud sync (public anon key, protected by RLS) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | your shell only | Optional: `npm run data:supabase`. **Never** put the service key in a `VITE_` variable. |

There are no other keys. Pronunciation uses the browser's built-in **Web Speech API** (`speechSynthesis`), and
Speak → Characters uses `SpeechRecognition` (Chrome, Edge, Safari). Stroke data comes from the free
hanzi-writer-data CDN and is cached by the service worker.

### Enabling sync (Supabase free tier)

1. Create a project at supabase.com (free tier).
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). It creates the tables, row-level security (users only ever see their own rows) and a profile trigger.
3. **Authentication → URL configuration**: add your site URL (e.g. `https://<you>.github.io/kan-bu-dong/`) and `http://localhost:5173/kan-bu-dong/` to the redirect URLs.
4. **Authentication → Providers**: email is on by default. For Google, create an OAuth client in Google Cloud Console (free) and paste its ID and secret.
5. Copy `.env.example` to `.env.local` and fill in the URL and anon key. For GitHub Pages, add them as repository secrets `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

Without these variables the sync code is removed from the bundle entirely, and Settings shows "Guest mode".

---

## Architecture

```
src/
  lib/
    dictionary.ts   offline dictionary: load (seed → IndexedDB/full), search, segmentation, simp⇄trad, examples
    pinyin.ts       tone numbers ⇄ marks, tone colors, pinyin query parsing + fuzzy regexes
    db.ts           Dexie (IndexedDB) schema: decks, cards, srs, reviews, writingAttempts, progress, kv, assets
    srs.ts          ts-fsrs wrapper: per-(card, mode) schedules, daily queue, interval previews
    cards.ts        deck/card CRUD, starter + pack decks, legacy migration, one-tap add
    sync.ts         optional Supabase auth + last-write-wins sync
    progress.ts     XP, streaks (study day rolls over at 4 am)
    settings.ts     script / pinyin / theme / study settings (localStorage)
    router.ts       tiny hash router (GitHub Pages has no SPA fallback)
    speech.ts       Web Speech TTS + recognition
    storage.ts      ORIGINAL localStorage set storage (kept: read once for migration)
  components/       original components (SetsView, SetDetailView, UploadView, EditView, DeckView,
                    ResultsView, PromptModal, StrokeOrder) + new shared ones
                    (EntryCard, TapText, WritingPad, GradeBar, AddButton, Sheet, Hanzi …)
  views/            Home, Dictionary, Word, Review, Cram, Write, Read, Packs, Radicals, FamilyTalk, Speak, Settings
  data/             authored content: packs.ts, readings.ts, familyTalk.ts, radicals.ts
  data/seed/        generated starter dictionary (committed)
scripts/
  build-data.mjs    data pipeline (see below)
  make-icons.ps1    regenerates the PWA icons
supabase/schema.sql
```

**Local-first.** All user data lives in IndexedDB via Dexie. The app works with no network and no account. Sync
pushes and pulls rows changed since the last sync, compares `updated_at`, and the newer row wins. Deletes are
soft (`deleted` flag) so they sync too.

**Offline.** `vite-plugin-pwa` (Workbox) precaches the app shell, including the starter dictionary chunk. The full
dictionary (about 13 MB of JSON, about 5 MB gzipped) is downloaded once in the background, stored in IndexedDB
(`assets` table) and re-downloaded only when the bundle's content hash changes. Stroke data is cached on first use.
Adding a card prefetches its stroke data, and Settings has a "cache stroke data for my cards" button.

**Dictionary engine.** Entries are pre-sorted by frequency in the data script, so array index = rank. The script
uses HSK frequency, then word counts from Tatoeba, and pushes proper nouns, surname-only entries and variant
entries down. Lookups use hash maps. Pinyin queries are split into syllables using the real syllable inventory,
then matched with per-syllable regexes. Exact matches rank above prefix matches, which rank above fuzzy matches.
English queries rank exact definition first, then prefix, then whole-word matches.

Running text (readings, example sentences, speech results) is split into words with a frequency-weighted
dynamic-programming segmenter. That fixed things like 说中|文 → 说|中文 and 做手|机 → 做|手机. Each word shows
its most common reading: a curated table covers frequent polyphones (了 le, 还 hái, 都 dōu …), and readings can
override a single word in context (`fix: { 长: 'zhang3' }`).

**SRS.** Every card gets one FSRS schedule per enabled quiz mode, Skritter-style, so reading memory and writing
memory are tracked separately. Decks default to Reading + Writing; Listening and Meaning can be switched on per
deck. "New words per day" counts *words*: once a word is started, all of its modes are introduced. Brand-new
writing items start in Trace mode. The suggested grade comes from the writing result (stroke mistakes, hints used)
and is highlighted on the grade bar.

### Data pipeline (`scripts/build-data.mjs`)

| Source | License | Used for |
|---|---|---|
| [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) (MDBG) | CC BY-SA 4.0 | entries, pinyin, definitions, traditional forms |
| [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) | MIT | HSK 2.0 (1–6) + HSK 3.0 (1–7/9) levels, part of speech, frequency rank |
| [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) | LGPL-3.0 / Arphic PL | radical, decomposition, etymology hint, stroke counts |
| [Tatoeba](https://tatoeba.org) exports (cmn sentences + cmn→eng links + eng sentences) | CC BY 2.0 FR | ~62k example sentence pairs (converted to simplified; shown in either script) |
| [hanzi-writer](https://hanziwriter.org) + hanzi-writer-data (CDN, runtime) | MIT / Arphic PL | stroke-order animation + stroke-checking quiz |

Output files:
- `public/data/dict.json`, `chars.json`, `sentences.json`, `meta.json`: the full offline bundle. These are git-ignored and built in CI.
- `src/data/seed/*.json`: the committed starter bundle.

The Tatoeba exports are bz2 files. They're decompressed with `seek-bzip`, a pure-JS dev dependency, so the script
runs the same on Windows, macOS and Linux CI.

---

## Changelog: original → now

### Kept from the original `chinese-flashcards`
- **Stack:** React 18 + TypeScript + Vite 5, GitHub Pages deploy under `/kan-bu-dong/`, plain CSS with design tokens. Every original token name (`--bg`, `--surface`, `--red` …) still works.
- **Your existing study sets.** On first launch, every set in `localStorage` (`cf_sets_v1`) is imported into a deck. Each original question text is preserved on the card (`legacyQuestion`) and parsed into pinyin + meaning (`bù rú (wouldn't it be better)` → `bù rú` / `wouldn't it be better`). The old localStorage key is **left untouched** as a backup.
- **Creating sets by pasting lines or uploading JSON** (`UploadView`), with the same two formats.
- **The AI prompt helper** (`PromptModal`), unchanged.
- **The whole-set study flow:** Got it / Again → results ring → redo missed (`DeckView`, `ResultsView`). It's now "⚡ Quick run-through" on each deck, for cramming without affecting the SRS schedule.
- **Stroke-order animation** (`StrokeOrder`), now themed, resizable, and used in the dictionary, reviews and writing.

### Changed
- `SetsView`: the set list became the deck library, with due counts, a "Review now" button and starter decks.
- `SetDetailView`: now shows a quiz-mode toggle per deck, the card list, and Study / Writing / Quick run-through buttons.
- `EditView`: the two parallel question/answer lists became per-card **characters / pinyin / meaning** rows, with add and remove. Blank fields are filled from the dictionary.
- **Data model:** `{question, answer}` cards in localStorage became Dexie tables (`decks`, `cards`, `srs`, `reviews` …). `toFlashCard()` converts back for the original study components.
- **Navigation:** view-state switching in `App.tsx` became hash routes with a bottom tab bar (Home · Dictionary · Flashcards · Write · Read), which turns into a left rail on desktop.
- **Paper writing:** the "write it on paper" hint was replaced by the on-screen Writing mode.

### Added
Everything in the feature table above: the dictionary and data pipeline, FSRS, the four quiz modes, the handwriting
pad, packs, readings, Speak, radicals, Family Talk, the dashboard, Traditional script, pinyin fading, dark mode,
PWA + offline, Supabase sync, backup/restore, and app icons.

---

## Decisions & trade-offs

- **Plain CSS instead of Tailwind + shadcn/ui.** The existing app was built on hand-written CSS with design tokens. Moving to Tailwind would have meant rewriting every original component's styles for no user-visible gain. The new UI uses the same token system: shared primitives live in `App.css`, and each feature has its own stylesheet.
- **Hash routing, no react-router.** GitHub Pages can't rewrite unknown paths to `index.html`, so hash URLs keep deep links (e.g. `#/word/电脑`) working on refresh, offline and from the home screen. The router is about 60 lines.
- **The dictionary is a static bundle, not a Supabase query.** Search has to work offline and feel instant, so the dictionary lives on the device; a Supabase-only dictionary would also put load on the free tier. The `dictionary_entries` table and `--supabase` seeding are included for completeness.
- **Search runs in memory on the main thread.** It scans 125k entries in a few milliseconds on a desktop, and around 20–50 ms on mid-range phones, with input debounced. Moving it to a Web Worker would be the next optimization if needed.
- **Built-in TTS voices.** These are free and offline-capable, but quality depends on the device. iOS and macOS have good Mandarin voices; some Android and Windows setups need a Chinese voice pack (Settings → Voice shows what's available).
- **Pinyin for running text is generated by the dictionary.** Common polyphones are handled, but a reading can still be wrong in an unusual context. Authored texts can pin a reading per line with `fix`. Pinyin uses dictionary (citation) tones, so 一 and 不 tone sandhi is not shown.
- **Sync is last-write-wins per row.** That's fine for one person on a few devices. Reviewing the same card at the same moment on two offline devices keeps only the newest schedule. The full review log still syncs.

## Known limitations / phase 2 ideas
- Freehand Quiz mode is self-graded; only Stroke check grades strokes automatically.
- No custom FSRS parameter optimization yet (the review log needed for it is already stored and synced).
- Possible next steps: more readings per pack, user-imported texts in the reader, audio recordings by native speakers, a Cantonese-aware "parents speak Cantonese" track.

## Data & licenses
App code: your project's license. Dictionary data: CC-CEDICT © MDBG & contributors, **CC BY-SA 4.0**. Any
redistribution of the generated `dict.json` must keep that license and attribution. Example sentences © Tatoeba
contributors (CC BY 2.0 FR). Character data © Make Me a Hanzi (LGPL / Arphic Public License).
