import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import { db, uid, type Card, type Deck, type QuizMode, type SrsItem } from './db';
import { addXp, endOfStudyDay, startOfStudyDay, XP } from './progress';
import { getSettings } from './settings';

export { Rating, State };
export type { Grade };

let scheduler = makeScheduler();
let schedulerRetention = getSettings().retention;
function makeScheduler() {
  return fsrs(generatorParameters({ enable_fuzz: true, request_retention: getSettings().retention }));
}
function f() {
  if (schedulerRetention !== getSettings().retention) {
    scheduler = makeScheduler();
    schedulerRetention = getSettings().retention;
  }
  return scheduler;
}

export function srsId(cardId: string, mode: QuizMode) {
  return `${cardId}|${mode}`;
}

function toFsrs(item: SrsItem): FsrsCard {
  return {
    due: new Date(item.due),
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: item.elapsed_days ?? 0,
    scheduled_days: item.scheduled_days,
    learning_steps: item.learning_steps,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state as State,
    last_review: item.last_review ? new Date(item.last_review) : undefined,
  } as FsrsCard;
}

function fromFsrs(base: SrsItem, c: FsrsCard): SrsItem {
  return {
    ...base,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: (c as { elapsed_days?: number }).elapsed_days ?? 0,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
    updatedAt: Date.now(),
  };
}

export function newItem(card: Pick<Card, 'id' | 'deckId'>, mode: QuizMode): SrsItem {
  const empty = createEmptyCard(new Date());
  return fromFsrs(
    { id: srsId(card.id, mode), cardId: card.id, deckId: card.deckId, mode } as SrsItem,
    empty,
  );
}

/** Makes sure every (card, enabled mode) pair has a schedule row. */
export async function ensureItems(cards: Card[], deckModes: Map<string, QuizMode[]>): Promise<void> {
  if (!cards.length) return;
  const ids = cards.flatMap((c) => (deckModes.get(c.deckId) ?? []).map((m) => srsId(c.id, m)));
  const existing = new Set((await db.srs.bulkGet(ids)).filter(Boolean).map((x) => x!.id));
  const missing: SrsItem[] = [];
  for (const c of cards) {
    for (const m of deckModes.get(c.deckId) ?? []) {
      if (!existing.has(srsId(c.id, m))) missing.push(newItem(c, m));
    }
  }
  if (missing.length) await db.srs.bulkPut(missing);
}

const DAY = 24 * 3600 * 1000;

export function formatInterval(ms: number): string {
  const m = ms / 60000;
  if (m < 1) return '<1m';
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

/** Interval each grade would produce — shown under the Again/Hard/Good/Easy buttons. */
export function previewIntervals(item: SrsItem): Record<Grade, string> {
  const now = new Date();
  const preview = f().repeat(toFsrs(item), now);
  const out = {} as Record<Grade, string>;
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    out[g] = formatInterval(preview[g].card.due.getTime() - now.getTime());
  }
  return out;
}

export async function gradeItem(item: SrsItem, grade: Grade, durationMs: number): Promise<SrsItem> {
  const now = new Date();
  const { card } = f().next(toFsrs(item), now, grade);
  const wasNew = item.state === State.New;
  const next = fromFsrs(item, card);
  if (wasNew) next.firstReviewedAt = now.getTime();
  await db.transaction('rw', db.srs, db.reviews, async () => {
    await db.srs.put(next);
    await db.reviews.add({
      id: uid(),
      cardId: item.cardId,
      srsId: item.id,
      mode: item.mode,
      grade,
      prevState: item.state,
      due: next.due,
      stability: next.stability,
      difficulty: next.difficulty,
      reviewedAt: now.getTime(),
      durationMs,
      updatedAt: now.getTime(),
    });
  });
  await addXp(XP.review + (wasNew ? XP.newCard : 0), 'reviews');
  return next;
}

// ---------------------------------------------------------------- queues

export interface QueueOptions {
  deckId?: string;
  mode?: QuizMode;
  /** override the daily new-card limit (e.g. "learn this pack now") */
  extraNew?: number;
}

export interface Queue {
  items: SrsItem[];
  dueCount: number;
  newCount: number;
  cards: Map<string, Card>;
}

const MODE_ORDER: QuizMode[] = ['reading', 'listening', 'meaning', 'writing'];

async function liveDecks(): Promise<Deck[]> {
  return (await db.decks.toArray()).filter((d) => !d.deleted);
}

/** How many brand-new words were started today (counts cards, not modes). */
export async function newCardsStartedToday(): Promise<number> {
  const start = startOfStudyDay();
  const rows = await db.srs.where('firstReviewedAt').aboveOrEqual(start).toArray();
  return new Set(rows.map((r) => r.cardId)).size;
}

export async function buildQueue(opts: QueueOptions = {}): Promise<Queue> {
  const decks = await liveDecks();
  const deckModes = new Map(decks.map((d) => [d.id, d.modes]));
  const deckIds = new Set(opts.deckId ? [opts.deckId] : decks.map((d) => d.id));
  const allCards = (await db.cards.toArray()).filter((c) => !c.deleted && deckIds.has(c.deckId));
  await ensureItems(allCards, deckModes);
  const cards = new Map(allCards.map((c) => [c.id, c]));

  const now = Date.now();
  const endOfDay = endOfStudyDay(now);
  const items = (await db.srs.toArray()).filter(
    (it) =>
      !it.deleted &&
      cards.has(it.cardId) &&
      (deckModes.get(it.deckId) ?? []).includes(it.mode) &&
      (!opts.mode || it.mode === opts.mode),
  );

  const due = items
    .filter((it) => it.state !== State.New && (it.state === State.Review ? it.due <= endOfDay : it.due <= now + 20 * 60000))
    .sort((a, b) => a.due - b.due);

  const started = await newCardsStartedToday();
  const allowance = Math.max(0, getSettings().newPerDay - started) + (opts.extraNew ?? 0);
  const newByCard = new Map<string, SrsItem[]>();
  for (const it of items) {
    if (it.state !== State.New) continue;
    if (!newByCard.has(it.cardId)) newByCard.set(it.cardId, []);
    newByCard.get(it.cardId)!.push(it);
  }
  // a card counts as "started" once any mode was reviewed: keep finishing its other modes
  const startedCards = new Set(items.filter((it) => it.state !== State.New).map((it) => it.cardId));
  const newCardIds = [...newByCard.keys()].sort((a, b) => {
    const sa = startedCards.has(a) ? 0 : 1;
    const sb = startedCards.has(b) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (cards.get(a)?.createdAt ?? 0) - (cards.get(b)?.createdAt ?? 0);
  });
  let budget = allowance;
  const fresh: SrsItem[] = [];
  for (const id of newCardIds) {
    if (!startedCards.has(id)) {
      if (budget <= 0) continue;
      budget--;
    }
    fresh.push(...newByCard.get(id)!.sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode)));
  }

  // spread new material through the reviews (Anki-style) instead of dumping it at the end
  const mixed: SrsItem[] = [];
  const gap = fresh.length ? Math.max(1, Math.floor(due.length / fresh.length)) : 0;
  let di = 0;
  for (const it of fresh) {
    for (let k = 0; k < gap && di < due.length; k++) mixed.push(due[di++]!);
    mixed.push(it);
  }
  while (di < due.length) mixed.push(due[di++]!);

  return { items: mixed, dueCount: due.length, newCount: fresh.length, cards };
}

/** Lightweight due counts for badges (no item creation). */
export async function dueCounts(): Promise<{ due: number; fresh: number; byDeck: Map<string, { due: number; fresh: number; total: number }> }> {
  const decks = await liveDecks();
  const modes = new Map(decks.map((d) => [d.id, d.modes]));
  const cards = (await db.cards.toArray()).filter((c) => !c.deleted && modes.has(c.deckId));
  const items = await db.srs.toArray();
  const now = Date.now();
  const endOfDay = endOfStudyDay(now);
  const byDeck = new Map<string, { due: number; fresh: number; total: number }>();
  for (const d of decks) byDeck.set(d.id, { due: 0, fresh: 0, total: 0 });
  const liveCards = new Set(cards.map((c) => c.id));
  for (const c of cards) byDeck.get(c.deckId)!.total++;
  const scheduled = new Set<string>();
  let due = 0;
  for (const it of items) {
    if (it.deleted || !liveCards.has(it.cardId) || !(modes.get(it.deckId) ?? []).includes(it.mode)) continue;
    if (it.state !== State.New) scheduled.add(it.cardId);
    const isDue = it.state !== State.New && (it.state === State.Review ? it.due <= endOfDay : it.due <= now + 20 * 60000);
    if (isDue) {
      due++;
      byDeck.get(it.deckId)!.due++;
    }
  }
  const started = await newCardsStartedToday();
  const allowance = Math.max(0, getSettings().newPerDay - started);
  let freshTotal = 0;
  for (const c of cards) {
    if (!scheduled.has(c.id)) {
      byDeck.get(c.deckId)!.fresh++;
      freshTotal++;
    }
  }
  return { due, fresh: Math.min(freshTotal, allowance), byDeck };
}

export function suggestedGrade(passed: boolean, mistakes: number, strokes: number): Grade {
  if (!passed) return Rating.Again;
  if (mistakes === 0) return Rating.Good;
  if (mistakes <= Math.max(1, Math.round(strokes * 0.2))) return Rating.Hard;
  return Rating.Again;
}
