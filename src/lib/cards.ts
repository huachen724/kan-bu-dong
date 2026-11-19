import { db, DEFAULT_MODES, kvGet, kvSet, uid, type Card, type Deck, type QuizMode } from './db';
import { cleanDefs, hskWords, primaryEntry, shortDefinition, toTraditional, type DictEntry } from './dictionary';
import { toMarked } from './pinyin';
import { getSettings, updateSettings } from './settings';
import { loadSets } from './storage';
import type { FlashCard } from '../types';
import type { Pack } from '../data/packs';

export const DEFAULT_DECK_ID = 'default';

export async function ensureDefaultDeck(): Promise<void> {
  const existing = await db.decks.get(DEFAULT_DECK_ID);
  if (existing && !existing.deleted) return;
  const now = Date.now();
  await db.decks.put({
    id: DEFAULT_DECK_ID,
    name: 'My Words',
    description: 'Words you add from the dictionary, readings and Speak.',
    kind: 'default',
    modes: DEFAULT_MODES,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export async function createDeck(
  name: string,
  opts: Partial<Pick<Deck, 'kind' | 'packId' | 'description' | 'modes' | 'id'>> = {},
): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = {
    id: opts.id ?? uid(),
    name: name.trim() || `Deck — ${new Date().toLocaleDateString()}`,
    description: opts.description,
    kind: opts.kind ?? 'custom',
    packId: opts.packId,
    modes: opts.modes ?? DEFAULT_MODES,
    createdAt: now,
    updatedAt: now,
  };
  await db.decks.put(deck);
  return deck;
}

export async function updateDeck(id: string, patch: Partial<Deck>): Promise<void> {
  await db.decks.update(id, { ...patch, updatedAt: Date.now() });
}

/** Soft delete (so the deletion syncs); cards and schedules go with it. */
export async function deleteDeck(id: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.decks, db.cards, db.srs, async () => {
    await db.decks.update(id, { deleted: 1, updatedAt: now });
    const cards = await db.cards.where('deckId').equals(id).toArray();
    await db.cards.bulkPut(cards.map((c) => ({ ...c, deleted: 1 as const, updatedAt: now })));
    const items = await db.srs.where('deckId').equals(id).toArray();
    await db.srs.bulkPut(items.map((i) => ({ ...i, deleted: 1 as const, updatedAt: now })));
  });
}

export async function deleteCard(id: string): Promise<void> {
  const now = Date.now();
  await db.cards.update(id, { deleted: 1, updatedAt: now });
  const items = await db.srs.where('cardId').equals(id).toArray();
  await db.srs.bulkPut(items.map((i) => ({ ...i, deleted: 1 as const, updatedAt: now })));
}

export async function restoreCard(id: string): Promise<void> {
  const now = Date.now();
  await db.cards.update(id, { deleted: 0, updatedAt: now });
  const items = await db.srs.where('cardId').equals(id).toArray();
  await db.srs.bulkPut(items.map((i) => ({ ...i, deleted: 0 as const, updatedAt: now })));
}

export interface NewCard {
  hanzi: string;
  trad?: string;
  pinyin: string;
  definition: string;
  hsk?: number;
  pos?: string;
  source: string;
  legacyQuestion?: string;
}

/** Fills in traditional form / pinyin / meaning from the dictionary where missing. */
export function completeCard(input: NewCard): NewCard {
  const e = primaryEntry(input.hanzi, input.pinyin || undefined);
  return {
    ...input,
    trad: input.trad || (e && e.s === input.hanzi ? e.t : toTraditional(input.hanzi)),
    pinyin: input.pinyin ? toMarked(input.pinyin) : e ? toMarked(e.p) : '',
    definition: input.definition || (e ? shortDefinition(e) : ''),
    hsk: input.hsk ?? (e?.hsk || undefined),
    pos: input.pos ?? (e?.pos || undefined),
  };
}

export async function addCard(input: NewCard, deckId = getSettings().lastDeckId): Promise<{ card: Card; created: boolean; deck: Deck }> {
  await ensureDefaultDeck();
  let deck = await db.decks.get(deckId);
  if (!deck || deck.deleted) {
    deck = (await db.decks.get(DEFAULT_DECK_ID))!;
    deckId = deck.id;
  }
  const existing = await db.cards.where('[deckId+hanzi]').equals([deckId, input.hanzi]).first();
  if (existing && !existing.deleted) return { card: existing, created: false, deck };
  const full = completeCard(input);
  const now = Date.now();
  const card: Card = {
    id: uid(),
    deckId,
    hanzi: full.hanzi,
    trad: full.trad ?? full.hanzi,
    pinyin: full.pinyin,
    definition: full.definition,
    hsk: full.hsk,
    pos: full.pos,
    source: full.source,
    legacyQuestion: full.legacyQuestion,
    createdAt: now,
    updatedAt: now,
  };
  await db.cards.put(card);
  await deckTouched(deckId);
  prefetchStrokes(card.hanzi + card.trad);
  return { card, created: true, deck };
}

export async function addCards(inputs: NewCard[], deckId: string): Promise<number> {
  const existing = new Set((await db.cards.where('deckId').equals(deckId).toArray()).filter((c) => !c.deleted).map((c) => c.hanzi));
  const now = Date.now();
  const rows: Card[] = [];
  inputs.forEach((input, i) => {
    if (existing.has(input.hanzi)) return;
    existing.add(input.hanzi);
    const full = completeCard(input);
    rows.push({
      id: uid(),
      deckId,
      hanzi: full.hanzi,
      trad: full.trad ?? full.hanzi,
      pinyin: full.pinyin,
      definition: full.definition,
      hsk: full.hsk,
      pos: full.pos,
      source: full.source,
      legacyQuestion: full.legacyQuestion,
      createdAt: now + i, // preserves order for new-card introduction
      updatedAt: now,
    });
  });
  await db.cards.bulkPut(rows);
  // bulk imports (migration, starter decks) must not change where one-tap "Add" goes
  await db.decks.update(deckId, { updatedAt: Date.now() });
  return rows.length;
}

export function entryToCard(e: DictEntry, source = 'dictionary'): NewCard {
  const { defs } = cleanDefs(e);
  return {
    hanzi: e.s,
    trad: e.t,
    pinyin: toMarked(e.p),
    definition: defs.slice(0, 3).join('; '),
    hsk: e.hsk || undefined,
    pos: e.pos || undefined,
    source,
  };
}

/** Moves a card (and its schedules) to another deck; drops it if that deck already has the word. */
export async function moveCard(cardId: string, deckId: string): Promise<void> {
  const card = await db.cards.get(cardId);
  if (!card || card.deckId === deckId) return;
  const dupe = await db.cards.where('[deckId+hanzi]').equals([deckId, card.hanzi]).first();
  if (dupe && !dupe.deleted) {
    await deleteCard(cardId);
    return;
  }
  const now = Date.now();
  await db.cards.update(cardId, { deckId, updatedAt: now });
  const items = await db.srs.where('cardId').equals(cardId).toArray();
  await db.srs.bulkPut(items.map((i) => ({ ...i, deckId, updatedAt: now })));
  await deckTouched(deckId);
}

export async function updateCard(id: string, patch: Partial<Card>): Promise<void> {
  await db.cards.update(id, { ...patch, updatedAt: Date.now() });
}

async function deckTouched(deckId: string) {
  await db.decks.update(deckId, { updatedAt: Date.now() });
  if (getSettings().lastDeckId !== deckId) updateSettings({ lastDeckId: deckId });
}

/** Warm the service-worker cache with hanzi-writer stroke data so writing works offline. */
export function prefetchStrokes(text: string): void {
  if (!navigator.onLine) return;
  for (const ch of new Set([...text].filter((c) => /[㐀-鿿]/.test(c)))) {
    fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${ch}.json`).catch(() => {});
  }
}

// ---------------------------------------------------------------- starter decks

export async function addHskDeck(level: number, modes?: QuizMode[]): Promise<Deck> {
  const id = `hsk-${level}`;
  const existing = await db.decks.get(id);
  const deck =
    existing && !existing.deleted
      ? existing
      : await createDeck(`HSK ${level}`, {
          id,
          kind: 'hsk',
          description: `HSK 2.0 level ${level} vocabulary from the dictionary data, most frequent first.`,
          modes,
        });
  await addCards(
    hskWords(level).map((e) => entryToCard(e, `hsk:${level}`)),
    deck.id,
  );
  return deck;
}

export async function addPackDeck(pack: Pack): Promise<Deck> {
  const id = `pack-${pack.id}`;
  const existing = await db.decks.get(id);
  const deck =
    existing && !existing.deleted
      ? existing
      : await createDeck(`${pack.icon} ${pack.title}`, { id, kind: 'pack', packId: pack.id, description: pack.blurb });
  await addCards(
    pack.words.map((w) => ({ hanzi: w.s, trad: w.t, pinyin: toMarked(w.p), definition: w.e, source: `pack:${pack.id}` })),
    deck.id,
  );
  return deck;
}

// ---------------------------------------------------------------- legacy (pre-SRS) migration

/** "bù rú (wouldn't it be better)" → pinyin + meaning. Falls back to the dictionary. */
export function parseLegacyQuestion(question: string): { pinyin: string; definition: string } {
  const m = /^(.*?)\s*[(（](.*)[)）]\s*$/.exec(question.trim());
  if (m && /[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/.test(m[1]!)) return { pinyin: m[1]!.trim(), definition: m[2]!.trim() };
  if (/^[a-zA-Z\sāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü0-5']+$/.test(question.trim())) return { pinyin: question.trim(), definition: '' };
  return { pinyin: '', definition: question.trim() };
}

export function flashcardToNewCard(fc: FlashCard, source: string): NewCard {
  const { pinyin, definition } = parseLegacyQuestion(fc.question);
  return { hanzi: fc.answer.trim(), pinyin, definition, source, legacyQuestion: fc.question };
}

/**
 * One-time import of study sets created by the original app (localStorage `cf_sets_v1`).
 * The old key is left untouched as a backup.
 */
export async function migrateLegacySets(): Promise<number> {
  if (await kvGet('legacyMigrated', false)) return 0;
  const sets = loadSets();
  let imported = 0;
  for (const set of sets) {
    const id = `legacy-${set.id}`;
    if (await db.decks.get(id)) continue;
    await db.decks.put({
      id,
      name: set.name,
      description: 'Imported from your original flashcard sets.',
      kind: 'legacy',
      modes: DEFAULT_MODES,
      createdAt: set.createdAt,
      updatedAt: Date.now(),
    });
    await addCards(
      set.cards.map((c) => flashcardToNewCard(c, 'legacy')),
      id,
    );
    imported++;
  }
  await kvSet('legacyMigrated', true);
  return imported;
}

/** Cards in the shape the original study components (DeckView / ResultsView) expect. */
export function toFlashCard(c: Card, script: 'simplified' | 'traditional'): FlashCard {
  const question = c.legacyQuestion ?? [c.pinyin, c.definition && `(${c.definition})`].filter(Boolean).join(' ');
  return { id: c.id, question, answer: script === 'traditional' ? c.trad || c.hanzi : c.hanzi };
}
