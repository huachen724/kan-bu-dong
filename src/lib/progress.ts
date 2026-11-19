import { db, type DayProgress } from './db';

/** The study day rolls over at 4am, so late-night reviews still count for "today". */
const ROLLOVER_HOURS = 4;

export function dayKey(d: Date | number = Date.now()): string {
  const t = new Date(typeof d === 'number' ? d : d.getTime());
  t.setHours(t.getHours() - ROLLOVER_HOURS);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const day = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Start of the current study day (ms) */
export function startOfStudyDay(now = Date.now()): number {
  const t = new Date(now);
  t.setHours(t.getHours() - ROLLOVER_HOURS);
  t.setHours(ROLLOVER_HOURS, 0, 0, 0);
  return t.getTime();
}

export function endOfStudyDay(now = Date.now()): number {
  return startOfStudyDay(now) + 24 * 3600 * 1000;
}

export const XP = {
  review: 10,
  newCard: 5,
  writingPass: 5,
  reading: 20,
  packStep: 15,
  radical: 2,
  phrase: 3,
};

type Counter = 'reviews' | 'newCards' | 'writing' | 'readings';

export async function addXp(xp: number, counter?: Counter, amount = 1): Promise<void> {
  const date = dayKey();
  await db.transaction('rw', db.progress, async () => {
    const row: DayProgress = (await db.progress.get(date)) ?? {
      date,
      xp: 0,
      reviews: 0,
      newCards: 0,
      writing: 0,
      readings: 0,
      updatedAt: 0,
    };
    row.xp += xp;
    if (counter) row[counter] += amount;
    row.updatedAt = Date.now();
    await db.progress.put(row);
  });
}

/** Consecutive study days ending today (or yesterday, if today has no activity yet). */
export function computeStreak(days: DayProgress[]): { streak: number; activeToday: boolean } {
  const active = new Set(days.filter((d) => d.xp > 0).map((d) => d.date));
  const today = dayKey();
  const activeToday = active.has(today);
  let streak = 0;
  const cursor = new Date(today + 'T12:00:00');
  if (!activeToday) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (!active.has(k)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { streak, activeToday };
}
