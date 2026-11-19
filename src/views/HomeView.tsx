import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { dueCounts, State } from '../lib/srs';
import { computeStreak, dayKey } from '../lib/progress';
import { useDictStatus } from '../lib/dictionary';
import { navigate } from '../lib/router';
import { useSettings } from '../lib/settings';
import { PACKS } from '../data/packs';
import { Hz } from '../components/Hanzi';
import { IconFlame, IconSettings } from '../components/Icons';
import { packProgress, useLearnedWords } from './PacksView';
import './HomeView.css';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜猫子'; // night owl
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export function HomeView() {
  const settings = useSettings();
  const dict = useDictStatus();
  const days = useLiveQuery(() => db.progress.toArray(), []);
  const counts = useLiveQuery(() => dueCounts(), []);
  const learned = useLearnedWords();
  const stats = useLiveQuery(async () => {
    const cards = (await db.cards.toArray()).filter((c) => !c.deleted);
    const live = new Set(cards.map((c) => c.id));
    const items = (await db.srs.toArray()).filter((s) => !s.deleted && live.has(s.cardId));
    const reading = items.filter((s) => s.mode === 'reading' && s.state === State.Review);
    const known = new Set(reading.map((s) => s.cardId));
    const mastered = new Set(reading.filter((s) => s.stability >= 21).map((s) => s.cardId));
    const chars = new Set<string>();
    for (const c of cards) if (known.has(c.id)) for (const ch of c.hanzi) if (/[㐀-鿿]/.test(ch)) chars.add(ch);
    const writingKnown = items.filter((s) => s.mode === 'writing' && s.state === State.Review).length;
    return { cards: cards.length, chars: chars.size, mastered: mastered.size, writingKnown };
  }, []);

  const today = days?.find((d) => d.date === dayKey());
  const xp = today?.xp ?? 0;
  const goal = settings.dailyGoal;
  const { streak, activeToday } = computeStreak(days ?? []);
  const pct = Math.min(1, xp / goal);
  const due = (counts?.due ?? 0) + (counts?.fresh ?? 0);
  const nextPack = PACKS.find((p) => packProgress(p, learned) < 1) ?? PACKS[0]!;
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
    const row = days?.find((x) => x.date === key);
    return { key, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), xp: row?.xp ?? 0 };
  });
  const circ = 2 * Math.PI * 34;

  return (
    <div className="page home">
      <header className="home-head">
        <div>
          <Hz s={greeting()} className="home-greet" />
          <p className="small muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <a className="icon-btn" href="#/settings" aria-label="Settings">
          <IconSettings />
        </a>
      </header>

      <section className="home-goal card">
        <svg viewBox="0 0 80 80" className="home-ring" aria-hidden>
          <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="40"
            cy="40"
            r="34"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${circ * pct} ${circ}`}
            transform="rotate(-90 40 40)"
          />
          <text x="40" y="38" textAnchor="middle" className="home-ring-num">
            {xp}
          </text>
          <text x="40" y="52" textAnchor="middle" className="home-ring-sub">
            / {goal} XP
          </text>
        </svg>
        <div className="grow">
          <div className={`home-streak ${activeToday ? 'on' : ''}`}>
            <IconFlame /> {streak} day{streak === 1 ? '' : 's'}
          </div>
          <p className="small muted">{pct >= 1 ? 'Daily goal reached 🎉' : activeToday ? 'Keep going!' : 'Study today to keep your streak.'}</p>
          <div className="home-week">
            {week.map((d) => (
              <span key={d.key} className={`home-day ${d.xp >= goal ? 'full' : d.xp > 0 ? 'some' : ''}`} title={`${d.key}: ${d.xp} XP`}>
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <button className="home-cta" onClick={() => navigate('review')} disabled={!due}>
        <div className="grow">
          <div className="home-cta-title">{due ? 'Start today\'s review' : 'All caught up!'}</div>
          <div className="home-cta-sub">
            {counts ? `${counts.due} due · ${counts.fresh} new words` : '…'}
            {due > 0 && ` · ~${Math.max(1, Math.round((due * 12) / 60))} min`}
          </div>
        </div>
        <span className="home-cta-arrow">→</span>
      </button>

      <section className="grid-3 home-stats">
        <div className="surface center">
          <div className="home-stat">{stats?.chars ?? 0}</div>
          <div className="tiny faint">characters known</div>
        </div>
        <div className="surface center">
          <div className="home-stat">{stats?.mastered ?? 0}</div>
          <div className="tiny faint">words mastered</div>
        </div>
        <div className="surface center">
          <div className="home-stat">{stats?.writingKnown ?? 0}</div>
          <div className="tiny faint">can write</div>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">
          Continue
          <a href="#/packs">All packs</a>
        </h2>
        <a className="home-pack" href={`#/pack/${nextPack.id}`} style={{ ['--tint' as string]: nextPack.tint }}>
          <span className="home-pack-icon">{nextPack.icon}</span>
          <div className="grow">
            <div className="bold">
              <Hz s={nextPack.zh} /> · {nextPack.title}
            </div>
            <div className="small muted">{nextPack.blurb}</div>
            <div className="progress-bar" style={{ marginTop: 8 }}>
              <span style={{ width: `${packProgress(nextPack, learned) * 100}%`, background: nextPack.tint }} />
            </div>
          </div>
        </a>
      </section>

      <section className="section">
        <h2 className="section-title">Tools</h2>
        <div className="grid-2">
          <a className="tool" href="#/speak">
            <span className="tool-icon">🎤</span>
            <span className="bold">Speak → Characters</span>
            <span className="tiny muted">Say it, see how it's written</span>
          </a>
          <a className="tool" href="#/family">
            <span className="tool-icon">👪</span>
            <span className="bold">Family Talk</span>
            <span className="tiny muted">Phrases for parents & grandparents</span>
          </a>
          <a className="tool" href="#/radicals">
            <span className="tool-icon hz">部</span>
            <span className="bold">Radical Trainer</span>
            <span className="tiny muted">40 radicals that unlock guessing</span>
          </a>
          <a className="tool" href="#/packs">
            <span className="tool-icon">🧩</span>
            <span className="bold">Vocab Packs</span>
            <span className="tiny muted">Learn by life domain</span>
          </a>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Progress by domain</h2>
        <div className="list">
          {PACKS.map((p) => {
            const v = packProgress(p, learned);
            return (
              <a key={p.id} className="list-item" href={`#/pack/${p.id}`}>
                <span style={{ fontSize: '1.3rem' }}>{p.icon}</span>
                <div className="grow">
                  <div className="row between small">
                    <span className="bold">{p.title}</span>
                    <span className="faint">{Math.round(v * 100)}%</span>
                  </div>
                  <div className="progress-bar" style={{ marginTop: 6 }}>
                    <span style={{ width: `${v * 100}%`, background: p.tint }} />
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <p className="tiny faint center" style={{ marginTop: 20 }}>
        {stats?.cards ?? 0} flashcards · dictionary: {dict.level === 'full' ? `${dict.entries.toLocaleString()} entries offline` : dict.loading ? `downloading ${Math.round(dict.progress * 100)}%` : 'starter set'}
      </p>
    </div>
  );
}
