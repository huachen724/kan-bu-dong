import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { kvGet, kvSet } from '../lib/db';
import { primaryEntry, shortDefinition } from '../lib/dictionary';
import { addXp, XP } from '../lib/progress';
import { goBack, wordHref } from '../lib/router';
import { RADICALS, type Radical } from '../data/radicals';
import { Hz, Pinyin } from '../components/Hanzi';
import { IconBack } from '../components/Icons';
import './ToolsViews.css';

function shuffle<T>(a: T[]): T[] {
  return [...a].sort(() => Math.random() - 0.5);
}

/** Radical Trainer: learn the 40 most useful radicals so unknown characters become guessable. */
export function RadicalsView() {
  const [tab, setTab] = useState<'learn' | 'quiz'>('learn');
  const known = useLiveQuery(() => kvGet<string[]>('radicalsKnown', []), []);
  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('')} aria-label="Back">
          <IconBack />
        </button>
        <h1>Radical Trainer</h1>
        <span className="small faint" style={{ paddingRight: 8 }}>
          {known?.length ?? 0}/{RADICALS.length}
        </span>
      </div>
      <p className="page-sub">
        Most characters = a <strong>meaning part</strong> (radical) + a <strong>sound part</strong>. Know these 40 and you can guess what new
        characters are about.
      </p>
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={tab === 'learn' ? 'active' : ''} onClick={() => setTab('learn')}>
          Learn
        </button>
        <button className={tab === 'quiz' ? 'active' : ''} onClick={() => setTab('quiz')}>
          Quiz
        </button>
      </div>
      {tab === 'learn' ? <RadicalList known={known ?? []} /> : <RadicalQuiz />}
    </div>
  );
}

function RadicalList({ known }: { known: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="radical-grid">
      {RADICALS.map((r) => (
        <button key={r.r} className={`radical-tile ${known.includes(r.r) ? 'known' : ''} ${open === r.r ? 'open' : ''}`} onClick={() => setOpen(open === r.r ? null : r.r)}>
          <span className="radical-glyph hz">{r.r}</span>
          <span className="tiny bold">{r.meaning}</span>
          {open === r.r && <RadicalDetail r={r} />}
        </button>
      ))}
    </div>
  );
}

function RadicalDetail({ r }: { r: Radical }) {
  return (
    <div className="radical-detail" onClick={(e) => e.stopPropagation()}>
      <p className="small">
        <span className="hz bold">{r.full ? `${r.r} ← ${r.full}` : r.r}</span> · {r.p}
      </p>
      <p className="small muted">{r.tip}</p>
      <div className="chips wrap">
        {r.examples.map((ch) => {
          const e = primaryEntry(ch);
          return (
            <a key={ch} className="chip" href={wordHref(ch)}>
              <Hz s={ch} className="bold" />
              {e && <span className="tiny faint">{shortDefinition(e, 1).slice(0, 14)}</span>}
            </a>
          );
        })}
      </div>
    </div>
  );
}

type Q = { kind: 'meaning'; r: Radical; options: string[] } | { kind: 'spot'; ch: string; r: Radical; options: Radical[] };

function makeQuestion(): Q {
  const r = RADICALS[Math.floor(Math.random() * RADICALS.length)]!;
  const others = shuffle(RADICALS.filter((x) => x.r !== r.r)).slice(0, 3);
  if (Math.random() < 0.5) return { kind: 'meaning', r, options: shuffle([r, ...others].map((x) => x.meaning)) };
  const ch = r.examples[Math.floor(Math.random() * r.examples.length)]!;
  return { kind: 'spot', ch, r, options: shuffle([r, ...others]) };
}

function RadicalQuiz() {
  const [q, setQ] = useState<Q>(makeQuestion);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const entry = useMemo(() => (q.kind === 'spot' ? primaryEntry(q.ch) : null), [q]);

  async function answer(value: string, correct: boolean) {
    if (picked) return;
    setPicked(value);
    setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
    if (correct) {
      await addXp(XP.radical);
      const known = await kvGet<string[]>('radicalsKnown', []);
      if (!known.includes(q.r.r)) await kvSet('radicalsKnown', [...known, q.r.r]);
    }
  }

  return (
    <div className="stack">
      <p className="small faint center">
        {score.right}/{score.total} correct
      </p>
      <div className="card center stack">
        {q.kind === 'meaning' ? (
          <>
            <p className="small muted">What does this radical mean?</p>
            <span className="quiz-glyph hz">{q.r.r}</span>
          </>
        ) : (
          <>
            <p className="small muted">Which radical gives this character its meaning?</p>
            <span className="quiz-glyph hz">{q.ch}</span>
            {picked && entry && (
              <p className="small">
                <Pinyin p={entry.p} force /> — {shortDefinition(entry, 2)}
              </p>
            )}
          </>
        )}
      </div>
      <div className="grid-2">
        {q.kind === 'meaning'
          ? q.options.map((m) => {
              const correct = m === q.r.meaning;
              return (
                <button
                  key={m}
                  className={`quiz-opt ${picked ? (correct ? 'right' : picked === m ? 'wrong' : '') : ''}`}
                  onClick={() => void answer(m, correct)}
                >
                  {m}
                </button>
              );
            })
          : q.options.map((r) => {
              const correct = r.r === q.r.r;
              return (
                <button
                  key={r.r}
                  className={`quiz-opt ${picked ? (correct ? 'right' : picked === r.r ? 'wrong' : '') : ''}`}
                  onClick={() => void answer(r.r, correct)}
                >
                  <span className="hz" style={{ fontSize: '1.6rem' }}>
                    {r.r}
                  </span>
                  <span className="tiny">{r.meaning}</span>
                </button>
              );
            })}
      </div>
      {picked && (
        <>
          <p className="small muted center">{q.r.tip}</p>
          <button className="btn btn-primary btn-block" onClick={() => (setQ(makeQuestion()), setPicked(null))}>
            Next →
          </button>
        </>
      )}
    </div>
  );
}
