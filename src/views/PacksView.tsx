import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, kvGet, kvSet } from '../lib/db';
import { addPackDeck } from '../lib/cards';
import { State } from '../lib/srs';
import { addXp, XP } from '../lib/progress';
import { goBack, navigate } from '../lib/router';
import { toast } from '../lib/toast';
import { PACKS, getPack, type Pack } from '../data/packs';
import { getReading } from '../data/readings';
import { AudioButton } from '../components/AudioButton';
import { Hz, Pinyin } from '../components/Hanzi';
import { IconBack, IconCheck } from '../components/Icons';
import { TapText } from '../components/TapText';
import './PacksView.css';

/** hanzi → learned (reading schedule has graduated to Review) */
export function useLearnedWords(): Set<string> | undefined {
  return useLiveQuery(async () => {
    const reading = (await db.srs.where('mode').equals('reading').toArray()).filter((s) => !s.deleted && s.state === State.Review);
    const ids = new Set(reading.map((s) => s.cardId));
    const cards = (await db.cards.bulkGet([...ids])).filter((c) => c && !c.deleted);
    return new Set(cards.map((c) => c!.hanzi));
  }, []);
}

export function packProgress(pack: Pack, learned: Set<string> | undefined): number {
  if (!learned) return 0;
  return pack.words.filter((w) => learned.has(w.s)).length / pack.words.length;
}

export function PacksView() {
  const learned = useLearnedWords();
  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('')} aria-label="Back">
          <IconBack />
        </button>
        <h1>Vocabulary packs</h1>
      </div>
      <p className="page-sub">From the words you say at home → outward to school, work and the internet.</p>
      <div className="packs-grid">
        {PACKS.map((p, i) => {
          const pct = packProgress(p, learned);
          return (
            <a key={p.id} className="pack-tile" href={`#/pack/${p.id}`} style={{ ['--tint' as string]: p.tint }}>
              <span className="pack-step">{i + 1}</span>
              <span className="pack-icon">{p.icon}</span>
              <span className="pack-zh hz">{p.zh}</span>
              <span className="pack-title">{p.title}</span>
              <span className="pack-count tiny">{p.words.length} words</span>
              <div className="progress-bar" style={{ marginTop: 'auto' }}>
                <span style={{ width: `${pct * 100}%`, background: p.tint }} />
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function PackView({ id }: { id: string }) {
  const pack = getPack(id);
  const learned = useLearnedWords();
  const [open, setOpen] = useState<number | null>(null);
  const state = useLiveQuery(async () => {
    const deck = await db.decks.get(`pack-${id}`);
    const steps = await kvGet<{ learn?: boolean }>(`pack:${id}`, {});
    const readings = await kvGet<string[]>('readingsDone', []);
    const words = new Set(pack?.words.map((w) => w.s));
    const wrote = (await db.writingAttempts.toArray()).some((a) => a.passed && words.has(a.hanzi));
    return { hasDeck: !!deck && !deck.deleted, learn: !!steps.learn, readings, wrote };
  }, [id]);
  if (!pack) return <div className="empty">Pack not found.</div>;
  const pct = packProgress(pack, learned);

  async function markLearn() {
    const steps = await kvGet<{ learn?: boolean }>(`pack:${id}`, {});
    if (!steps.learn) {
      await kvSet(`pack:${id}`, { ...steps, learn: true });
      await addXp(XP.packStep);
    }
  }

  async function makeDeck(study: boolean) {
    const deck = await addPackDeck(pack!);
    if (!state?.hasDeck) {
      await addXp(XP.packStep);
      toast(`Created ${pack!.words.length} flashcards`);
    }
    if (study) navigate(`review?deck=${deck.id}&new=${Math.min(10, pack!.words.length)}`);
  }

  const readingDone = pack.readingIds.every((r) => state?.readings.includes(r));

  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('packs')} aria-label="Back">
          <IconBack />
        </button>
        <h1>{pack.title}</h1>
      </div>

      <div className="pack-hero" style={{ ['--tint' as string]: pack.tint }}>
        <span className="pack-hero-icon">{pack.icon}</span>
        <div>
          <Hz s={pack.zh} className="pack-hero-zh" />
          <p className="small muted">{pack.blurb}</p>
          <div className="progress-bar" style={{ marginTop: 8, width: 180 }}>
            <span style={{ width: `${pct * 100}%`, background: pack.tint }} />
          </div>
          <p className="tiny faint" style={{ marginTop: 4 }}>
            {Math.round(pct * 100)}% learned
          </p>
        </div>
      </div>

      <div className="tip">
        <strong>Heritage bridge · </strong>
        {pack.tip}
      </div>

      <ol className="steps">
        <Step n={1} title="Learn the words" done={state?.learn} sub={`${pack.words.length} words with audio & examples`}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              void markLearn();
              document.getElementById('pack-words')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Browse words ↓
          </button>
        </Step>
        <Step n={2} title="Flashcards" done={state?.hasDeck} sub="Auto-generated deck with reading + writing reviews">
          <button className="btn btn-primary btn-sm" onClick={() => void makeDeck(true)}>
            {state?.hasDeck ? 'Study deck' : 'Create & study'}
          </button>
        </Step>
        <Step n={3} title="Mini reading" done={readingDone} sub={pack.readingIds.map((r) => getReading(r)?.title).join(' · ')}>
          <div className="row wrap">
            {pack.readingIds.map((r) => (
              <a key={r} className="btn btn-secondary btn-sm" href={`#/read/${r}`}>
                <Hz s={getReading(r)?.zh ?? r} />
              </a>
            ))}
          </div>
        </Step>
        <Step n={4} title="Writing practice" done={state?.wrote} sub="Write each word on screen — scheduled with SRS">
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              const deck = await addPackDeck(pack);
              navigate(`review?deck=${deck.id}&mode=writing&new=${Math.min(10, pack.words.length)}`);
            }}
          >
            ✍️ Start writing
          </button>
        </Step>
      </ol>

      <section className="section" id="pack-words" style={{ scrollMarginTop: 64 }}>
        <h2 className="section-title">Words</h2>
        <div className="list">
          {pack.words.map((w, i) => (
            <div key={w.s} className="pack-word">
              <button className="pack-word-main" onClick={() => (setOpen(open === i ? null : i), void markLearn())}>
                <Hz s={w.s} t={w.t} className="pack-word-hz" />
                <div className="grow">
                  <Pinyin p={w.p} />
                  <div className="small muted">{w.e}</div>
                </div>
                {learned?.has(w.s) && <IconCheck style={{ width: 18, height: 18, color: 'var(--green)' }} />}
                <AudioButton text={w.s} size="sm" />
              </button>
              {open === i && (
                <div className="pack-word-more">
                  {w.ex && (
                    <div className="example">
                      <TapText text={w.ex[0]} ruby />
                      <p className="small muted">{w.ex[1]}</p>
                    </div>
                  )}
                  {w.note && <p className="small">💡 {w.note}</p>}
                  <div className="row">
                    <a className="btn btn-secondary btn-sm" href={`#/word/${encodeURIComponent(w.s)}`}>
                      Dictionary
                    </a>
                    <a className="btn btn-secondary btn-sm" href={`#/write/${encodeURIComponent(w.s)}`}>
                      ✍️ Write
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, sub, done, children }: { n: number; title: string; sub: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className={`step ${done ? 'done' : ''}`}>
      <span className="step-n">{done ? <IconCheck /> : n}</span>
      <div className="grow">
        <div className="bold">{title}</div>
        <div className="tiny muted" style={{ marginBottom: 8 }}>
          {sub}
        </div>
        {children}
      </div>
    </li>
  );
}
