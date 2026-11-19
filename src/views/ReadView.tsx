import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { kvGet, kvSet } from '../lib/db';
import { addXp, XP } from '../lib/progress';
import { goBack } from '../lib/router';
import { speak } from '../lib/speech';
import { updateSettings, useSettings } from '../lib/settings';
import { toast } from '../lib/toast';
import { getPack } from '../data/packs';
import { READINGS, type Reading } from '../data/readings';
import { AudioButton } from '../components/AudioButton';
import { Hz } from '../components/Hanzi';
import { IconBack, IconCheck } from '../components/Icons';
import { TapText } from '../components/TapText';
import './ReadView.css';

const KIND_LABEL: Record<Reading['kind'], string> = {
  chat: 'Chat',
  dialogue: 'Dialogue',
  story: 'Story',
  menu: 'Menu',
  sign: 'Signs',
  note: 'Note',
};

export function ReadView() {
  const [level, setLevel] = useState<number | null>(null);
  const done = useLiveQuery(() => kvGet<string[]>('readingsDone', []), []);
  const list = READINGS.filter((r) => !level || r.level === level);
  return (
    <div className="page">
      <h1 className="page-title">Read</h1>
      <p className="page-sub">Short real-life texts. Tap any word for the dictionary.</p>
      <div className="chips" style={{ marginBottom: 14 }}>
        {[null, 1, 2, 3].map((lv) => (
          <button key={String(lv)} className={`chip ${level === lv ? 'active' : ''}`} onClick={() => setLevel(lv)}>
            {lv ? `Level ${lv}` : 'All'}
          </button>
        ))}
      </div>
      <div className="list">
        {list.map((r) => {
          const pack = r.packId ? getPack(r.packId) : undefined;
          return (
            <a key={r.id} className="list-item" href={`#/read/${r.id}`}>
              <span className="read-icon">{pack?.icon ?? '📖'}</span>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <Hz s={r.zh} className="bold read-title-zh" />
                  {done?.includes(r.id) && <IconCheck style={{ width: 16, height: 16, color: 'var(--green)' }} />}
                </div>
                <div className="small muted">
                  {r.title} · {KIND_LABEL[r.kind]} · L{r.level}
                </div>
              </div>
              <span className="chev">›</span>
            </a>
          );
        })}
      </div>
      <p className="tiny faint" style={{ marginTop: 12 }}>
        Want to read something else? Paste any Chinese text into the Dictionary search to break it into words.
      </p>
    </div>
  );
}

type Display = 'chars' | 'pinyin' | 'translation';

export function ReaderView({ id }: { id: string }) {
  const reading = READINGS.find((r) => r.id === id);
  const settings = useSettings();
  const [display, setDisplay] = useState<Display>(settings.pinyin === 'show' ? 'pinyin' : 'chars');
  const [showEn, setShowEn] = useState<Set<number>>(new Set());
  const done = useLiveQuery(() => kvGet<string[]>('readingsDone', []), []);
  if (!reading) return <div className="empty">Reading not found.</div>;
  const ruby = display === 'pinyin';
  const translate = display === 'translation';
  const finished = done?.includes(reading.id);

  async function markDone() {
    if (!reading) return;
    const list = await kvGet<string[]>('readingsDone', []);
    if (!list.includes(reading.id)) {
      await kvSet('readingsDone', [...list, reading.id]);
      await addXp(XP.reading, 'readings');
      toast(`+${XP.reading} XP · reading complete`);
    }
    goBack('read');
  }

  const toggleLine = (i: number) =>
    setShowEn((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div className="page reader">
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('read')} aria-label="Back">
          <IconBack />
        </button>
        <h1>{reading.title}</h1>
        <AudioButton text={reading.lines.map((l) => l.zh).join('。')} size="sm" />
      </div>

      <div className="reader-head">
        <Hz s={reading.zh} className="reader-title" />
        <p className="small muted">{reading.intro}</p>
      </div>

      <div className="segmented reader-toggle" role="radiogroup" aria-label="Display">
        {(
          [
            ['chars', '汉字'],
            ['pinyin', '+ Pinyin'],
            ['translation', '+ English'],
          ] as [Display, string][]
        ).map(([d, label]) => (
          <button
            key={d}
            className={display === d ? 'active' : ''}
            onClick={() => {
              setDisplay(d);
              if (d === 'pinyin' && settings.pinyin === 'hide') updateSettings({ pinyin: 'tap' });
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`reader-body kind-${reading.kind}`}>
        {reading.lines.map((line, i) => {
          const en = translate || showEn.has(i);
          if (reading.kind === 'chat') {
            return (
              <div key={i} className={`chat-row ${line.me ? 'me' : ''}`}>
                {!line.me && <span className="chat-avatar hz">{line.who?.slice(-1)}</span>}
                <div className="chat-col">
                  {!line.me && line.who && <span className="chat-name hz">{line.who}</span>}
                  <div className="chat-bubble" onDoubleClick={() => toggleLine(i)}>
                    <TapText text={line.zh} ruby={ruby} fix={line.fix} />
                    {en && <p className="reader-en">{line.en}</p>}
                  </div>
                </div>
                <button className="line-tools" onClick={() => speak(line.zh)} aria-label="Play line">
                  🔊
                </button>
              </div>
            );
          }
          if (reading.kind === 'menu') {
            return (
              <div key={i} className="menu-row">
                <div className="grow">
                  <TapText text={line.zh} ruby={ruby} fix={line.fix} className="menu-zh" />
                  {en && <p className="reader-en">{line.en}</p>}
                </div>
                {line.price && <span className="menu-price">{line.price}</span>}
              </div>
            );
          }
          if (reading.kind === 'sign') {
            return (
              <div key={i} className="sign">
                <TapText text={line.zh} ruby={ruby} fix={line.fix} className="sign-zh" />
                {en && <p className="reader-en">{line.en}</p>}
              </div>
            );
          }
          return (
            <div key={i} className="line">
              {line.who && <span className="line-who hz">{line.who}</span>}
              <div className="grow">
                <TapText text={line.zh} ruby={ruby} fix={line.fix} className="line-zh" />
                {en && <p className="reader-en">{line.en}</p>}
              </div>
              <div className="line-actions">
                <button className="line-tools" onClick={() => speak(line.zh)} aria-label="Play line">
                  🔊
                </button>
                {!translate && (
                  <button className="line-tools" onClick={() => toggleLine(i)} aria-label="Show translation">
                    EN
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 20 }} onClick={() => void markDone()}>
        <IconCheck /> {finished ? 'Done' : `Finished reading (+${XP.reading} XP)`}
      </button>
    </div>
  );
}
