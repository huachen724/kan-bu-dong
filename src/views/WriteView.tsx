import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../lib/db';
import { primaryEntry, search, shortDefinition, useDictStatus } from '../lib/dictionary';
import { dueCounts, State } from '../lib/srs';
import { addXp, XP } from '../lib/progress';
import { goBack, navigate } from '../lib/router';
import { useSettings, updateSettings } from '../lib/settings';
import { hasCJK, isCJKChar } from '../lib/pinyin';
import { AudioButton } from '../components/AudioButton';
import { Hz, Pinyin } from '../components/Hanzi';
import { IconBack } from '../components/Icons';
import { StrokeOrder } from '../components/StrokeOrder';
import { WritingPad, type PadMode, type WritingResult } from '../components/WritingPad';
import { AddButton } from '../components/AddButton';
import { entryToCard } from '../lib/cards';
import './WriteView.css';

/** Write tab: writing reviews (SRS) + free practice for any word. */
export function WriteView() {
  const [q, setQ] = useState('');
  useDictStatus();
  const counts = useLiveQuery(async () => {
    const decks = (await db.decks.toArray()).filter((d) => !d.deleted && d.modes.includes('writing'));
    const ids = new Set(decks.map((d) => d.id));
    const items = await db.srs.where('mode').equals('writing').toArray();
    const now = Date.now();
    return {
      due: items.filter((i) => !i.deleted && ids.has(i.deckId) && i.state !== State.New && i.due <= now + 6 * 3600e3).length,
      decks: decks.length,
    };
  }, []);
  const all = useLiveQuery(() => dueCounts(), []);
  const recentCards = useLiveQuery(async () => (await db.cards.orderBy('updatedAt').reverse().limit(40).toArray()).filter((c) => !c.deleted), []);
  const attempts = useLiveQuery(() => db.writingAttempts.orderBy('createdAt').reverse().limit(24).toArray(), []);
  const results = q.trim() ? search(q, 8).entries : [];
  const { grid } = useSettings();

  return (
    <div className="page">
      <h1 className="page-title">Write</h1>
      <p className="page-sub">Your notebook, on screen. Writing reviews are scheduled with the rest of your flashcards.</p>

      <button className="write-cta" onClick={() => navigate('review?mode=writing')} disabled={!counts?.due && !all?.fresh}>
        <span className="write-cta-icon">✍️</span>
        <span className="grow">
          <span className="write-cta-title">Writing review</span>
          <span className="write-cta-sub">
            {counts?.due ? `${counts.due} characters due` : 'Nothing due'} {all?.fresh ? `· ${all.fresh} new` : ''}
          </span>
        </span>
        <span>→</span>
      </button>

      <section className="section">
        <h2 className="section-title">Practice any word</h2>
        <input
          className="field"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type 汉字, pinyin or English…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hasCJK(q)) navigate(`write/${encodeURIComponent(q.trim())}`);
          }}
        />
        {results.length > 0 && (
          <div className="list" style={{ marginTop: 8 }}>
            {results.map((e) => (
              <a key={e.id} className="list-item" href={`#/write/${encodeURIComponent(e.s)}`}>
                <Hz s={e.s} t={e.t} className="write-row-hz" />
                <div className="grow">
                  <Pinyin p={e.p} force className="small" />
                  <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shortDefinition(e, 2)}
                  </div>
                </div>
                <span className="chev">›</span>
              </a>
            ))}
          </div>
        )}
      </section>

      {recentCards && recentCards.length > 0 && (
        <section className="section">
          <h2 className="section-title">From your flashcards</h2>
          <div className="chips wrap">
            {recentCards.slice(0, 24).map((c) => (
              <a key={c.id} className="chip write-chip" href={`#/write/${encodeURIComponent(c.hanzi)}`}>
                <Hz s={c.hanzi} t={c.trad} />
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Grid</h2>
        <div className="segmented">
          {(
            [
              ['tian', '田字格'],
              ['mi', '米字格'],
              ['none', 'Blank'],
            ] as const
          ).map(([g, label]) => (
            <button key={g} className={grid === g ? 'active' : ''} onClick={() => updateSettings({ grid: g })}>
              <span className="hz">{label}</span>
            </button>
          ))}
        </div>
      </section>

      {attempts && attempts.length > 0 && (
        <section className="section">
          <h2 className="section-title">Recent attempts</h2>
          <div className="attempts">
            {attempts.map((a) => (
              <a key={a.id} className={`attempt ${a.passed === false ? 'fail' : a.passed ? 'pass' : ''}`} href={`#/write/${encodeURIComponent(a.hanzi)}`}>
                {a.image ? <img src={a.image} alt={`Your ${a.hanzi}`} /> : <Hz s={a.hanzi} className="attempt-hz" />}
                <span className="tiny">
                  <Hz s={a.hanzi} /> {a.passed === false ? '✗' : a.passed ? '✓' : ''}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const MODES: [PadMode, string, string][] = [
  ['trace', 'Trace', 'Follow the ghost character stroke by stroke'],
  ['quiz', 'Quiz', 'Write from memory, then compare with the real stroke order'],
  ['strokes', 'Stroke check', 'Write from memory — every stroke is checked'],
  ['free', 'Free write', 'Blank canvas with undo / redo / clear'],
];

export function WritePracticeView({ word, initialMode }: { word: string; initialMode?: PadMode }) {
  const { script } = useSettings();
  useDictStatus();
  const entry = primaryEntry(word);
  const shown = script === 'traditional' ? entry?.t ?? word : entry?.s ?? word;
  const chars = [...shown].filter(isCJKChar);
  const [mode, setMode] = useState<PadMode>(initialMode ?? 'trace');
  const [result, setResult] = useState<WritingResult | null>(null);
  const [round, setRound] = useState(0);
  const [showOrder, setShowOrder] = useState(false);

  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  async function onDone(r: WritingResult) {
    setResult(r);
    const card = await db.cards.where('hanzi').equals(entry?.s ?? word).first();
    await db.writingAttempts.add({
      id: uid(),
      cardId: card?.id,
      hanzi: shown,
      mode,
      passed: mode === 'free' ? null : r.passed,
      mistakes: r.mistakes,
      image: r.image,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await addXp(mode !== 'free' && r.passed ? XP.writingPass : 1, 'writing');
  }

  return (
    <div className="page write-practice">
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('write')} aria-label="Back">
          <IconBack />
        </button>
        <h1>Practice</h1>
        {entry && <AudioButton text={entry.s} size="sm" />}
      </div>

      <div className="wpv-info">
        {mode !== 'quiz' && mode !== 'strokes' ? <Hz s={entry?.s ?? word} t={entry?.t} className="wpv-hz" /> : null}
        <div className="grow">
          {entry && <Pinyin p={entry.p} force className="wpv-py" />}
          {entry && <p className="small muted">{shortDefinition(entry, 2)}</p>}
        </div>
        {entry && <AddButton card={entryToCard(entry)} compact />}
      </div>

      <div className="segmented" style={{ margin: '10px 0' }}>
        {MODES.map(([m, label]) => (
          <button
            key={m}
            className={mode === m ? 'active' : ''}
            onClick={() => {
              setMode(m);
              setResult(null);
              setRound((r) => r + 1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="tiny faint center" style={{ marginBottom: 8 }}>
        {MODES.find((m) => m[0] === mode)![2]}
      </p>

      {result ? (
        <div className="wpv-result">
          <div className="wpv-result-head">
            {mode === 'free' ? '🖌️ Nice practice!' : result.passed ? '✅ Correct!' : '❌ Keep practicing'}
            {mode !== 'free' && (
              <span className="small muted">
                {' '}
                · {result.mistakes} mistake{result.mistakes === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {result.image && <img className="wpv-img" src={result.image} alt="Your writing" />}
          <StrokeOrder answer={shown} size={96} />
          <div className="grid-2" style={{ width: '100%' }}>
            <button className="btn btn-secondary" onClick={() => (setResult(null), setRound((r) => r + 1))}>
              Again
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const next = MODES.findIndex((m) => m[0] === mode);
                const nm = mode === 'trace' ? 'quiz' : mode === 'quiz' ? 'strokes' : MODES[(next + 1) % MODES.length]![0];
                setMode(nm);
                setResult(null);
                setRound((r) => r + 1);
              }}
            >
              {mode === 'trace' ? 'Now from memory →' : 'Next mode →'}
            </button>
          </div>
        </div>
      ) : chars.length ? (
        <>
          <WritingPad key={`${round}-${mode}`} chars={chars} mode={mode} onDone={onDone} maxHeight={0.5} />
          {(mode === 'quiz' || mode === 'strokes') && (
            <div className="center">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowOrder((s) => !s)}>
                {showOrder ? 'Hide stroke order' : 'Show stroke order hint'}
              </button>
              {showOrder && <StrokeOrder answer={shown} size={72} label="" />}
            </div>
          )}
        </>
      ) : (
        <p className="muted">No Chinese characters to practice in “{word}”.</p>
      )}
    </div>
  );
}
