import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid, type Card, type QuizMode, type SrsItem } from '../lib/db';
import { buildQueue, gradeItem, Rating, State, suggestedGrade, type Grade } from '../lib/srs';
import { randomEntries } from '../lib/dictionary';
import { addXp, computeStreak, XP } from '../lib/progress';
import { goBack, navigate, wordHref } from '../lib/router';
import { speak, ttsSupported } from '../lib/speech';
import { updateSettings, useSettings } from '../lib/settings';
import { syncNow } from '../lib/sync';
import { AudioButton } from '../components/AudioButton';
import { GradeBar } from '../components/GradeBar';
import { Hz, Pinyin } from '../components/Hanzi';
import { IconClose, IconFlame, IconSpeaker } from '../components/Icons';
import { StrokeOrder } from '../components/StrokeOrder';
import { WritingPad, type PadMode, type WritingResult } from '../components/WritingPad';
import './ReviewView.css';

const MODE_LABEL: Record<QuizMode, string> = {
  reading: 'Reading',
  writing: 'Writing',
  listening: 'Listening',
  meaning: 'Meaning',
};

const MODE_HINT: Record<QuizMode, string> = {
  reading: 'Say the pinyin and meaning, then reveal',
  writing: 'Write it from memory',
  listening: 'Which word did you hear?',
  meaning: 'Recall the characters for this',
};

export function ReviewView({ deckId, mode, extraNew }: { deckId?: string; mode?: QuizMode; extraNew?: number }) {
  const [queue, setQueue] = useState<SrsItem[] | null>(null);
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  const [pos, setPos] = useState(0);
  const [stats, setStats] = useState({ reviewed: 0, correct: 0, xp: 0, newCards: 0 });
  const deck = useLiveQuery(() => (deckId ? db.decks.get(deckId) : undefined), [deckId]);

  useEffect(() => {
    let alive = true;
    void buildQueue({ deckId, mode, extraNew }).then((q) => {
      if (!alive) return;
      setQueue(q.items);
      setCards(q.cards);
    });
    return () => {
      alive = false;
    };
  }, [deckId, mode, extraNew]);

  const item = queue?.[pos];
  const card = item ? cards.get(item.cardId) : undefined;

  const onGraded = useCallback(
    async (g: Grade, durationMs: number) => {
      if (!item || !queue) return;
      const wasNew = item.state === State.New;
      const next = await gradeItem(item, g, durationMs);
      setStats((s) => ({
        reviewed: s.reviewed + 1,
        correct: s.correct + (g >= Rating.Good ? 1 : 0),
        xp: s.xp + XP.review + (wasNew ? XP.newCard : 0),
        newCards: s.newCards + (wasNew ? 1 : 0),
      }));
      const q = [...queue];
      // short relearning steps come back in this session (Anki-style)
      if (next.due <= Date.now() + 20 * 60000) q.push(next);
      setQueue(q);
      setPos((p) => p + 1);
    },
    [item, queue],
  );

  if (!queue) return <div className="rv2-loading">Building your review queue…</div>;

  const total = queue.length;
  const done = !item || !card;
  const title = deck?.name ?? (mode ? `${MODE_LABEL[mode]} review` : 'Daily review');

  return (
    <div className="rv2">
      <header className="rv2-head">
        <button className="icon-btn" onClick={() => goBack('')} aria-label="End session">
          <IconClose />
        </button>
        <div className="grow">
          <div className="progress-bar">
            <span style={{ width: `${total ? (Math.min(pos, total) / total) * 100 : 100}%` }} />
          </div>
          <div className="rv2-meta">
            <span>{title}</span>
            <span>
              {Math.min(pos + 1, total)} / {total}
            </span>
          </div>
        </div>
      </header>

      {done ? (
        <SessionDone stats={stats} empty={total === 0} deckId={deckId} mode={mode} />
      ) : (
        <ReviewCard key={`${item.id}-${pos}`} item={item} card={card} allCards={cards} onGraded={onGraded} />
      )}
    </div>
  );
}

function ReviewCard({
  item,
  card,
  allCards,
  onGraded,
}: {
  item: SrsItem;
  card: Card;
  allCards: Map<string, Card>;
  onGraded: (g: Grade, ms: number) => void;
}) {
  const settings = useSettings();
  const started = useRef(Date.now());
  const [revealed, setRevealed] = useState(false);
  const [suggested, setSuggested] = useState<Grade | undefined>();
  const trad = settings.script === 'traditional';
  const word = trad ? card.trad || card.hanzi : card.hanzi;
  const isNew = item.state === State.New;

  const reveal = useCallback(
    (g?: Grade) => {
      setRevealed(true);
      if (g) setSuggested(g);
      if (settings.autoplay && item.mode !== 'listening') speak(card.hanzi);
    },
    [settings.autoplay, item.mode, card.hanzi],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !revealed && item.mode !== 'writing' && item.mode !== 'listening') {
        e.preventDefault();
        reveal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, reveal, item.mode]);

  const grade = useCallback((g: Grade) => onGraded(g, Date.now() - started.current), [onGraded]);

  return (
    <div className={`rv2-card mode-${item.mode}`}>
      <div className="rv2-tags">
        <span className="badge badge-accent">{MODE_LABEL[item.mode]}</span>
        {isNew && <span className="badge badge-green">New</span>}
        <span className="tiny faint">{MODE_HINT[item.mode]}</span>
      </div>

      <div className="rv2-body">
        {item.mode === 'reading' && <ReadingFront card={card} />}
        {item.mode === 'meaning' && <MeaningFront card={card} />}
        {item.mode === 'listening' && (
          <ListeningFront card={card} allCards={allCards} revealed={revealed} onAnswer={(ok) => reveal(ok ? Rating.Good : Rating.Again)} />
        )}
        {item.mode === 'writing' && !revealed && (
          <WritingFront
            card={card}
            word={word}
            isNew={isNew}
            onResult={async (r, padMode) => {
              await db.writingAttempts.add({
                id: uid(),
                cardId: card.id,
                hanzi: word,
                mode: padMode === 'trace' ? 'trace' : padMode === 'strokes' ? 'strokes' : 'review',
                passed: r.passed,
                mistakes: r.mistakes,
                image: r.image,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
              await addXp(r.passed ? XP.writingPass : 0, 'writing');
              let g = suggestedGrade(r.passed, r.mistakes, r.strokes);
              if (padMode === 'trace' && g > Rating.Hard) g = Rating.Hard as Grade;
              if (r.hinted && g > Rating.Hard) g = Rating.Hard as Grade;
              reveal(g);
            }}
            onGiveUp={() => reveal(Rating.Again as Grade)}
          />
        )}

        {revealed && <Answer card={card} word={word} mode={item.mode} />}
      </div>

      <footer className="rv2-foot">
        {revealed ? (
          <GradeBar item={item} suggested={suggested} onGrade={grade} />
        ) : item.mode === 'reading' || item.mode === 'meaning' ? (
          <button className="btn btn-primary btn-lg btn-block" onClick={() => reveal()}>
            Show answer
          </button>
        ) : null}
      </footer>
    </div>
  );
}

function ReadingFront({ card }: { card: Card }) {
  return (
    <div className="rv2-front">
      <Hz s={card.hanzi} t={card.trad} className="rv2-big hz-kai" />
    </div>
  );
}

function MeaningFront({ card }: { card: Card }) {
  return (
    <div className="rv2-front">
      <p className="rv2-meaning">{card.definition || card.legacyQuestion}</p>
      <p className="small faint">{[...card.hanzi].length} character{[...card.hanzi].length > 1 ? 's' : ''}</p>
    </div>
  );
}

function ListeningFront({
  card,
  allCards,
  revealed,
  onAnswer,
}: {
  card: Card;
  allCards: Map<string, Card>;
  revealed: boolean;
  onAnswer: (correct: boolean) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const canSpeak = ttsSupported();
  const choices = useMemo(() => {
    const len = [...card.hanzi].length;
    const pool = [...allCards.values()].filter((c) => c.hanzi !== card.hanzi);
    pool.sort((a, b) => Math.abs([...a.hanzi].length - len) - Math.abs([...b.hanzi].length - len) || Math.random() - 0.5);
    const picks = pool.slice(0, 3).map((c) => ({ s: c.hanzi, t: c.trad }));
    if (picks.length < 3) {
      const exclude = new Set([card.hanzi, ...picks.map((p) => p.s)]);
      for (const e of randomEntries(3 - picks.length, len, exclude)) picks.push({ s: e.s, t: e.t });
    }
    return [...picks, { s: card.hanzi, t: card.trad }].sort(() => Math.random() - 0.5);
  }, [card, allCards]);

  useEffect(() => {
    if (canSpeak) {
      const t = setTimeout(() => speak(card.hanzi), 250);
      return () => clearTimeout(t);
    }
  }, [card.hanzi, canSpeak]);

  return (
    <div className="rv2-front">
      {canSpeak ? (
        <button className="rv2-listen" onClick={() => speak(card.hanzi)} aria-label="Play again">
          <IconSpeaker />
        </button>
      ) : (
        <div className="stack-sm center">
          <Pinyin p={card.pinyin} force className="rv2-py-prompt" />
          <p className="tiny faint">No speech voice on this device — read the pinyin instead.</p>
        </div>
      )}
      <div className="rv2-choices">
        {choices.map((c) => {
          const correct = c.s === card.hanzi;
          const state = picked ? (correct ? 'right' : picked === c.s ? 'wrong' : '') : '';
          return (
            <button
              key={c.s}
              className={`rv2-choice ${state}`}
              disabled={!!picked || revealed}
              onClick={() => {
                setPicked(c.s);
                onAnswer(correct);
              }}
            >
              <Hz s={c.s} t={c.t} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WritingFront({
  card,
  word,
  isNew,
  onResult,
  onGiveUp,
}: {
  card: Card;
  word: string;
  isNew: boolean;
  onResult: (r: WritingResult, mode: PadMode) => void;
  onGiveUp: () => void;
}) {
  const settings = useSettings();
  // brand-new words start in trace mode so you learn the strokes before being quizzed
  const [mode, setMode] = useState<PadMode>(isNew ? 'trace' : settings.writingMode);
  const chars = [...word].filter((c) => /[㐀-鿿豈-﫿]/.test(c));

  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  return (
    <div className="rv2-write">
      <div className="rv2-write-prompt">
        <div className="grow">
          <Pinyin p={card.pinyin} force className="rv2-write-py" />
          <p className="small muted">{card.definition}</p>
        </div>
        <AudioButton text={card.hanzi} />
      </div>
      <div className="segmented" style={{ width: '100%', maxWidth: 480 }}>
        {(
          [
            ['quiz', 'From memory'],
            ['strokes', 'Stroke check'],
            ['trace', 'Trace'],
          ] as [PadMode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            className={mode === m ? 'active' : ''}
            onClick={() => {
              setMode(m);
              if (m !== 'trace') updateSettings({ writingMode: m as 'quiz' | 'strokes' });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {chars.length ? (
        <WritingPad chars={chars} mode={mode} onDone={(r) => onResult(r, mode)} maxHeight={0.46} />
      ) : (
        <p className="muted">This card has no Chinese characters to write.</p>
      )}
      <button className="btn btn-ghost btn-sm" onClick={onGiveUp}>
        I don't remember — show me
      </button>
    </div>
  );
}

function Answer({ card, word, mode }: { card: Card; word: string; mode: QuizMode }) {
  return (
    <div className="rv2-answer">
      {mode !== 'reading' && <Hz s={card.hanzi} t={card.trad} className="rv2-ans-hz hz-kai" />}
      <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
        <Pinyin p={card.pinyin} force className="rv2-ans-py" />
        <AudioButton text={card.hanzi} size="sm" />
      </div>
      {mode !== 'meaning' && <p className="rv2-ans-def">{card.definition}</p>}
      {card.legacyQuestion && card.legacyQuestion !== `${card.pinyin} (${card.definition})` && (
        <p className="tiny faint">Original card: {card.legacyQuestion}</p>
      )}
      {mode === 'writing' && <StrokeOrder answer={word} size={72} label="" />}
      <a className="small rv2-dict-link" href={wordHref(card.hanzi)}>
        Open in dictionary →
      </a>
    </div>
  );
}

function SessionDone({
  stats,
  empty,
  deckId,
  mode,
}: {
  stats: { reviewed: number; correct: number; xp: number; newCards: number };
  empty: boolean;
  deckId?: string;
  mode?: QuizMode;
}) {
  const days = useLiveQuery(() => db.progress.toArray(), []);
  const { streak } = computeStreak(days ?? []);
  useEffect(() => {
    if (stats.reviewed) void syncNow();
  }, [stats.reviewed]);
  const pct = stats.reviewed ? Math.round((stats.correct / stats.reviewed) * 100) : 0;
  const qs = new URLSearchParams();
  if (deckId) qs.set('deck', deckId);
  if (mode) qs.set('mode', mode);
  qs.set('new', '10');
  qs.set('t', String(Date.now()));
  return (
    <div className="rv2-done">
      <div className="rv2-done-emoji">{empty ? '✨' : pct >= 80 ? '🎉' : '💪'}</div>
      <h2>{empty ? 'Nothing due right now' : 'Session complete'}</h2>
      {empty ? (
        <p className="muted">You're all caught up. Learn some new words, or come back later.</p>
      ) : (
        <div className="grid-3" style={{ width: '100%' }}>
          <div className="surface center">
            <div className="rv2-stat">{stats.reviewed}</div>
            <div className="tiny faint">reviews</div>
          </div>
          <div className="surface center">
            <div className="rv2-stat">{pct}%</div>
            <div className="tiny faint">remembered</div>
          </div>
          <div className="surface center">
            <div className="rv2-stat">+{stats.xp}</div>
            <div className="tiny faint">XP</div>
          </div>
        </div>
      )}
      {streak > 0 && (
        <p className="row" style={{ justifyContent: 'center', color: 'var(--amber)', fontWeight: 700 }}>
          <IconFlame style={{ width: 20, height: 20 }} /> {streak}-day streak
        </p>
      )}
      <div className="stack" style={{ width: '100%' }}>
        <button className="btn btn-primary btn-lg btn-block" onClick={() => navigate(`review?${qs}`, { replace: true })}>
          Learn 10 more new words
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => navigate('', { replace: true })}>
          Back to home
        </button>
      </div>
    </div>
  );
}
