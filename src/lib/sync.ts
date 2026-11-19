/**
 * Optional cloud sync with Supabase (free tier). The app is fully usable without it (guest mode);
 * when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set and the user signs in, local IndexedDB
 * rows are pushed/pulled with last-write-wins on `updatedAt`. Schema: supabase/schema.sql.
 */
import { useSyncExternalStore } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { db, kvGet, kvSet, type Card, type DayProgress, type Deck, type ReviewLog, type SrsItem, type WritingAttempt } from './db';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const syncConfigured = !!(URL_ && KEY_);

let clientPromise: Promise<SupabaseClient> | null = null;
export function getClient(): Promise<SupabaseClient> {
  if (!syncConfigured) return Promise.reject(new Error('Supabase is not configured'));
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(URL_!, KEY_!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }),
  );
  return clientPromise;
}

interface SyncState {
  session: Session | null;
  syncing: boolean;
  lastSync: number;
  error?: string;
}
let state: SyncState = { session: null, syncing: false, lastSync: 0 };
const listeners = new Set<() => void>();
function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function useSync(): SyncState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export async function initSync(): Promise<void> {
  if (!syncConfigured) return;
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  set({ session: data.session, lastSync: await kvGet('lastSync', 0) });
  sb.auth.onAuthStateChange((_evt, session) => {
    const wasSignedOut = !state.session;
    set({ session });
    if (session && wasSignedOut) void syncNow();
  });
  if (data.session) void syncNow();
  window.addEventListener('online', () => void syncNow());
}

export async function signInWithEmail(email: string): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const sb = await getClient();
  await sb.auth.signOut();
  set({ session: null });
}

// ---------------------------------------------------------------- table mappings
type Row = Record<string, unknown>;
const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : 0);

interface Mapping<T> {
  local: 'decks' | 'cards' | 'srs' | 'reviews' | 'writingAttempts' | 'progress';
  remote: string;
  conflict: string;
  toRow(x: T, user: string): Row;
  fromRow(r: Row): T;
  stamp(x: T): number;
}

const decks: Mapping<Deck> = {
  local: 'decks',
  remote: 'decks',
  conflict: 'id',
  stamp: (x) => x.updatedAt,
  toRow: (x, user) => ({
    id: x.id, user_id: user, name: x.name, description: x.description ?? null, kind: x.kind, pack_id: x.packId ?? null,
    modes: x.modes, created_at: iso(x.createdAt), updated_at: iso(x.updatedAt), deleted: !!x.deleted,
  }),
  fromRow: (r) => ({
    id: r.id as string, name: r.name as string, description: (r.description as string) ?? undefined, kind: r.kind as Deck['kind'],
    packId: (r.pack_id as string) ?? undefined, modes: r.modes as Deck['modes'], createdAt: ms(r.created_at), updatedAt: ms(r.updated_at),
    deleted: r.deleted ? 1 : 0,
  }),
};

const cards: Mapping<Card> = {
  local: 'cards',
  remote: 'cards',
  conflict: 'id',
  stamp: (x) => x.updatedAt,
  toRow: (x, user) => ({
    id: x.id, user_id: user, deck_id: x.deckId, character: x.hanzi, traditional: x.trad, pinyin: x.pinyin, definition: x.definition,
    hsk_level: x.hsk ?? null, part_of_speech: x.pos ?? null, source: x.source, legacy_question: x.legacyQuestion ?? null,
    created_at: iso(x.createdAt), updated_at: iso(x.updatedAt), deleted: !!x.deleted,
  }),
  fromRow: (r) => ({
    id: r.id as string, deckId: r.deck_id as string, hanzi: r.character as string, trad: r.traditional as string, pinyin: r.pinyin as string,
    definition: r.definition as string, hsk: (r.hsk_level as number) ?? undefined, pos: (r.part_of_speech as string) ?? undefined,
    source: r.source as string, legacyQuestion: (r.legacy_question as string) ?? undefined, createdAt: ms(r.created_at),
    updatedAt: ms(r.updated_at), deleted: r.deleted ? 1 : 0,
  }),
};

const srs: Mapping<SrsItem> = {
  local: 'srs',
  remote: 'card_srs',
  conflict: 'id',
  stamp: (x) => x.updatedAt,
  toRow: (x, user) => {
    const { id, cardId, deckId, mode, due, updatedAt, deleted, ...fsrs } = x;
    return { id, user_id: user, card_id: cardId, deck_id: deckId, mode, due_date: iso(due), state: x.state, fsrs_state: fsrs, updated_at: iso(updatedAt), deleted: !!deleted };
  },
  fromRow: (r) => ({
    ...(r.fsrs_state as object),
    id: r.id as string, cardId: r.card_id as string, deckId: r.deck_id as string, mode: r.mode as SrsItem['mode'],
    due: ms(r.due_date), updatedAt: ms(r.updated_at), deleted: r.deleted ? 1 : 0,
  }) as SrsItem,
};

const reviews: Mapping<ReviewLog> = {
  local: 'reviews',
  remote: 'reviews',
  conflict: 'id',
  stamp: (x) => x.updatedAt,
  toRow: (x, user) => ({
    id: x.id, user_id: user, card_id: x.cardId, srs_id: x.srsId, mode: x.mode, grade: x.grade,
    fsrs_state: { prevState: x.prevState, stability: x.stability, difficulty: x.difficulty },
    due_date: iso(x.due), reviewed_at: iso(x.reviewedAt), duration_ms: x.durationMs, updated_at: iso(x.updatedAt),
  }),
  fromRow: (r) => {
    const f = (r.fsrs_state ?? {}) as { prevState?: number; stability?: number; difficulty?: number };
    return {
      id: r.id as string, cardId: r.card_id as string, srsId: r.srs_id as string, mode: r.mode as ReviewLog['mode'], grade: r.grade as number,
      prevState: f.prevState ?? 0, stability: f.stability ?? 0, difficulty: f.difficulty ?? 0, due: ms(r.due_date),
      reviewedAt: ms(r.reviewed_at), durationMs: (r.duration_ms as number) ?? 0, updatedAt: ms(r.updated_at),
    };
  },
};

const attempts: Mapping<WritingAttempt> = {
  local: 'writingAttempts',
  remote: 'writing_attempts',
  conflict: 'id',
  stamp: (x) => x.updatedAt,
  toRow: (x, user) => ({
    id: x.id, user_id: user, card_id: x.cardId ?? null, character: x.hanzi, mode: x.mode, passed: x.passed, mistakes: x.mistakes,
    image: x.image ?? null, created_at: iso(x.createdAt), updated_at: iso(x.updatedAt),
  }),
  fromRow: (r) => ({
    id: r.id as string, cardId: (r.card_id as string) ?? undefined, hanzi: r.character as string, mode: r.mode as WritingAttempt['mode'],
    passed: r.passed as boolean | null, mistakes: r.mistakes as number, image: (r.image as string) ?? undefined,
    createdAt: ms(r.created_at), updatedAt: ms(r.updated_at),
  }),
};

const progress: Mapping<DayProgress> = {
  local: 'progress',
  remote: 'user_progress',
  conflict: 'user_id,date',
  stamp: (x) => x.updatedAt,
  toRow: (x, user) => ({
    user_id: user, date: x.date, xp: x.xp, reviews: x.reviews, new_cards: x.newCards, writing: x.writing, readings: x.readings,
    updated_at: iso(x.updatedAt),
  }),
  fromRow: (r) => ({
    date: r.date as string, xp: r.xp as number, reviews: r.reviews as number, newCards: r.new_cards as number,
    writing: r.writing as number, readings: r.readings as number, updatedAt: ms(r.updated_at),
  }),
};

const MAPPINGS = [decks, cards, srs, reviews, attempts, progress] as Mapping<unknown>[];

async function syncTable<T>(sb: SupabaseClient, m: Mapping<T>, user: string) {
  const table = db[m.local] as unknown as import('dexie').Table<T, string>;
  const pushKey = `sync:push:${m.remote}`;
  const pullKey = `sync:pull:${m.remote}`;
  const lastPush = await kvGet(pushKey, 0);
  const lastPull = await kvGet(pullKey, '1970-01-01T00:00:00Z');

  // push
  const changed = await table.where('updatedAt').above(lastPush).toArray();
  const startedAt = Date.now();
  for (let i = 0; i < changed.length; i += 500) {
    const batch = changed.slice(i, i + 500).map((x) => m.toRow(x, user));
    const { error } = await sb.from(m.remote).upsert(batch, { onConflict: m.conflict });
    if (error) throw new Error(`${m.remote}: ${error.message}`);
  }

  // pull (paged)
  let cursor = lastPull;
  for (;;) {
    const { data, error } = await sb.from(m.remote).select('*').gt('updated_at', cursor).order('updated_at').limit(1000);
    if (error) throw new Error(`${m.remote}: ${error.message}`);
    if (!data?.length) break;
    const incoming = data.map((r) => m.fromRow(r));
    const keys = incoming.map((x) => (m.local === 'progress' ? (x as DayProgress).date : (x as { id: string }).id));
    const local = await table.bulkGet(keys);
    const winners = incoming.filter((x, i) => !local[i] || m.stamp(local[i] as T) < m.stamp(x));
    if (winners.length) await table.bulkPut(winners);
    cursor = data[data.length - 1]!.updated_at as string;
    if (data.length < 1000) break;
  }
  await kvSet(pushKey, startedAt);
  await kvSet(pullKey, cursor);
}

let running: Promise<void> | null = null;
export function syncNow(): Promise<void> {
  if (!syncConfigured || !state.session || !navigator.onLine) return Promise.resolve();
  running ??= (async () => {
    set({ syncing: true, error: undefined });
    try {
      const sb = await getClient();
      const user = state.session!.user.id;
      for (const m of MAPPINGS) await syncTable(sb, m, user);
      const now = Date.now();
      await kvSet('lastSync', now);
      set({ lastSync: now });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ syncing: false });
      running = null;
    }
  })();
  return running;
}
