import { useState } from 'react';
import { addXp, XP } from '../lib/progress';
import { goBack } from '../lib/router';
import { useSettings } from '../lib/settings';
import { FAMILY_TALK } from '../data/familyTalk';
import { AddButton } from '../components/AddButton';
import { AudioButton } from '../components/AudioButton';
import { Hz } from '../components/Hanzi';
import { IconBack } from '../components/Icons';
import { TapText } from '../components/TapText';
import { pinyinForText } from '../lib/dictionary';
import { toMarked } from '../lib/pinyin';
import './ToolsViews.css';

/** Family Talk / Sentence Builder: practical, respectful things to say to parents and grandparents. */
export function FamilyTalkView() {
  const settings = useSettings();
  const [group, setGroup] = useState(FAMILY_TALK[0]!.id);
  const [ruby, setRuby] = useState(settings.pinyin !== 'hide');
  const [hideEn, setHideEn] = useState(false);
  const current = FAMILY_TALK.find((g) => g.id === group)!;

  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('')} aria-label="Back">
          <IconBack />
        </button>
        <h1>Family Talk</h1>
      </div>
      <p className="page-sub">Things you'd actually say at home — read them, hear them, save them, write them.</p>
      <div className="chips" style={{ marginBottom: 12 }}>
        {FAMILY_TALK.map((g) => (
          <button key={g.id} className={`chip ${g.id === group ? 'active' : ''}`} onClick={() => setGroup(g.id)}>
            {g.icon} {g.title}
          </button>
        ))}
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Hz s={current.zh} className="bold grow" style={{ fontSize: '1.2rem' }} />
        <button className={`chip ${ruby ? 'active' : ''}`} onClick={() => setRuby((r) => !r)}>
          Pinyin
        </button>
        <button className={`chip ${hideEn ? 'active' : ''}`} onClick={() => setHideEn((h) => !h)}>
          Quiz me
        </button>
      </div>
      <div className="stack">
        {current.phrases.map((ph) => (
          <PhraseCard key={ph.zh} zh={ph.zh} en={ph.en} note={ph.note} ruby={ruby} hideEn={hideEn} />
        ))}
      </div>
    </div>
  );
}

function PhraseCard({ zh, en, note, ruby, hideEn }: { zh: string; en: string; note?: string; ruby: boolean; hideEn: boolean }) {
  const [shown, setShown] = useState(false);
  const clean = zh.replace(/[！？。，、]/g, '');
  return (
    <div className="phrase card">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <TapText text={zh} ruby={ruby} className="phrase-zh" />
          {hideEn && !shown ? (
            <button className="small faint" onClick={() => (setShown(true), void addXp(XP.phrase))}>
              Tap to check the meaning
            </button>
          ) : (
            <p className="phrase-en">{en}</p>
          )}
          {note && (!hideEn || shown) && <p className="tiny muted" style={{ marginTop: 4 }}>💡 {note}</p>}
        </div>
        <AudioButton text={zh} size="sm" />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <AddButton compact card={{ hanzi: clean, pinyin: toMarked(pinyinForText(clean)), definition: en, source: 'family-talk' }} />
        <a className="btn btn-secondary btn-sm" href={`#/write/${encodeURIComponent(clean)}`}>
          ✍️ Write it
        </a>
      </div>
    </div>
  );
}
