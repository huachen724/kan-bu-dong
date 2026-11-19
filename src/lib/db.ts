import Dexie, { type Table } from 'dexie';

export type QuizMode = 'reading' | 'writing' | 'listening' | 'meaning';
export const ALL_MODES: QuizMode[] = ['reading', 'writing', 'listening', 'meaning'];
export const DEFAULT_MODES: QuizMode[] = ['reading', 'writing'];

export interface Deck {
  id: string;
  name: string;
  description?: string;
  kind: 'default' | 'custom' | 'legacy' | 'pack' | 'hsk';
  packId?: string;
  modes: QuizMode[];
  createdAt: number;
  updatedAt: number;
  deleted?: 0 | 1;
}

export interface Card {
  id: string;
  deckId: string;
  /** simplified form */
  hanzi: string;
  trad: string;
  /** tone-marked pinyin, e.g. "nǐ hǎo" */
  pinyin: string;
  definition: string;
  hsk?: number;
  pos?: string;
  /** 'dictionary' | 'pack:<id>' | 'hsk:<n>' | 'import' | 'legacy' | 'reading' | 'speak' */
  source: string;
  /** original question text from the pre-SRS flashcard system, kept verbatim */
  legacyQuestion?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: 0 | 1;
}

/** One FSRS schedule per (card, quiz mode) — Skritter-style separate reading / writing memory. */
export interface SrsItem {
  id: string; // `${cardId}|${mode}`
  cardId: string;
  deckId: string;
  mode: QuizMode;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days?: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number; // ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review?: number;
  firstReviewedAt?: number;
  updatedAt: number;
  deleted?: 0 | 1;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  srsId: string;
  mode: QuizMode;
  grade: number; // 1 Again, 2 Hard, 3 Good, 4 Easy
  prevState: number;
  due: number;
  stability: number;
  difficulty: number;
  reviewedAt: number;
  durationMs: number;
  updatedAt: number;
}

export interface WritingAttempt {
  id: string;
  cardId?: string;
  hanzi: string;
  mode: 'trace' | 'quiz' | 'strokes' | 'free' | 'review';
  passed: boolean | null;
  mistakes: number;
  image?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DayProgress {
  date: string; // YYYY-MM-DD (day rolls over at 4am)
  xp: number;
  reviews: number;
  newCards: number;
  writing: number;
  readings: number;
  updatedAt: number;
}

export interface KV {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface Asset {
  key: string;
  version: string;
  data: string;
}

class AppDB extends Dexie {
  decks!: Table<Deck, string>;
  cards!: Table<Card, string>;
  srs!: Table<SrsItem, string>;
  reviews!: Table<ReviewLog, string>;
  writingAttempts!: Table<WritingAttempt, string>;
  progress!: Table<DayProgress, string>;
  kv!: Table<KV, string>;
  assets!: Table<Asset, string>;

  constructor() {
    super('hanzi-heritage');
    this.version(1).stores({
      decks: 'id, kind, packId, updatedAt',
      cards: 'id, deckId, hanzi, updatedAt, [deckId+hanzi]',
      srs: 'id, cardId, deckId, mode, due, state, firstReviewedAt, updatedAt',
      reviews: 'id, cardId, srsId, reviewedAt, updatedAt',
      writingAttempts: 'id, cardId, hanzi, createdAt, updatedAt',
      progress: 'date, updatedAt',
      kv: 'key, updatedAt',
      assets: 'key',
    });
  }
}

export const db = new AppDB();

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  return row ? (row.value as T) : fallback;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value, updatedAt: Date.now() });
}
