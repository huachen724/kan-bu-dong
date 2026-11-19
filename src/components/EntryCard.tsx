import { useMemo, useState } from 'react';
import {
  charInfo,
  cleanDefs,
  compounds,
  examples,
  lookup,
  posLabel,
  primaryEntry,
  shortDefinition,
  toSimplified,
  type DictEntry,
} from '../lib/dictionary';
import { entryToCard } from '../lib/cards';
import { isCJKChar, toMarked } from '../lib/pinyin';
import { wordHref } from '../lib/router';
import { useSettings } from '../lib/settings';
import { packSentences } from '../data/packs';
import { AddButton } from './AddButton';
import { AudioButton } from './AudioButton';
import { Hz, Pinyin, ToneHanzi } from './Hanzi';
import { CharStroke } from './StrokeOrder';
import { TapText } from './TapText';
import './EntryCard.css';

export function HskBadges({ e }: { e: Pick<DictEntry, 'hsk' | 'hsk3'> }) {
  return (
    <>
      {e.hsk > 0 && <span className="badge badge-hsk">HSK {e.hsk}</span>}
      {e.hsk3 > 0 && (
        <span className="badge badge-hsk3" title="HSK 3.0 band">
          新HSK {e.hsk3 >= 7 ? '7-9' : e.hsk3}
        </span>
      )}
    </>
  );
}

/** Pleco-style dictionary entry. `compact` is the in-page popup version. */
export function EntryCard({ entry, compact = false }: { entry: DictEntry; compact?: boolean }) {
  const { script } = useSettings();
  const { defs, classifiers } = cleanDefs(entry);
  const other = script === 'traditional' ? entry.s : entry.t;
  const pos = posLabel(entry.pos);
  const chars = [...entry.s].filter(isCJKChar);
  const scriptChars = [...(script === 'traditional' ? entry.t : entry.s)].filter(isCJKChar);

  return (
    <article className={`entry ${compact ? 'entry-compact' : ''}`}>
      <header className="entry-head">
        <div className="grow">
          <div className="entry-hz-row">
            <ToneHanzi s={entry.s} t={entry.t} p={entry.p} className="entry-hz" />
            {entry.t !== entry.s && (
              <span className="entry-alt hz" lang={script === 'traditional' ? 'zh-Hans' : 'zh-Hant'}>
                {script === 'traditional' ? '简' : '繁'} {other}
              </span>
            )}
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
            <Pinyin p={entry.p} force className="entry-py" />
            <HskBadges e={entry} />
            {pos && <span className="badge">{pos}</span>}
          </div>
        </div>
        <AudioButton text={entry.s} size="lg" />
      </header>

      <ol className="entry-defs">
        {defs.slice(0, compact ? 4 : 12).map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ol>
      {classifiers && <p className="small muted">Measure word: {classifiers}</p>}

      <div style={{ marginTop: 12 }}>
        <AddButton card={entryToCard(entry)} />
      </div>

      {compact ? (
        <CharBreakdown chars={scriptChars} compact />
      ) : (
        <>
          <section className="section">
            <h3 className="section-title">Stroke order</h3>
            <div className="row wrap" style={{ gap: 12 }}>
              {chars.map((ch, i) => (
                <CharStroke key={`${ch}${i}`} character={script === 'traditional' ? [...entry.t][i] ?? ch : ch} size={chars.length > 2 ? 84 : 110} />
              ))}
            </div>
            <a className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} href={`#/write/${encodeURIComponent(entry.s)}`}>
              ✍️ Practice writing
            </a>
          </section>
          <CharBreakdown chars={scriptChars} />
          <Examples word={entry.s} />
          <Family chars={chars} word={entry.s} />
          <OtherReadings entry={entry} />
        </>
      )}
    </article>
  );
}

function CharBreakdown({ chars, compact = false }: { chars: string[]; compact?: boolean }) {
  const infos = chars.map((c) => ({ c, info: charInfo(c), entry: primaryEntry(c) }));
  if (!infos.some((x) => x.info)) return null;
  return (
    <section className="section">
      <h3 className="section-title">{chars.length > 1 ? 'Characters' : 'Radical & components'}</h3>
      <div className="stack-sm">
        {infos.map(({ c, info, entry }, i) => (
          <a key={`${c}${i}`} className="char-row" href={chars.length > 1 ? wordHref(c) : undefined}>
            <Hz s={c} t={entry?.t} className="char-row-hz" />
            <div className="grow">
              <div className="row wrap" style={{ gap: 6 }}>
                {entry && <Pinyin p={entry.p} force className="small" />}
                <span className="small muted">{entry ? shortDefinition(entry, 2) : info?.definition}</span>
              </div>
              {info && (
                <div className="tiny faint" style={{ marginTop: 3 }}>
                  Radical <span className="hz bold muted">{info.radical}</span>
                  {info.strokes > 0 && <> · {info.strokes} strokes</>}
                  {info.components.length > 0 && (
                    <>
                      {' '}
                      · Parts <span className="hz muted">{info.components.join(' + ')}</span>
                    </>
                  )}
                </div>
              )}
              {!compact && info?.hint && <div className="tiny muted" style={{ marginTop: 3 }}>💡 {info.hint}</div>}
              {!compact && info?.etymologyType === 'pictophonetic' && info.phonetic && (
                <div className="tiny muted" style={{ marginTop: 2 }}>
                  Meaning from <span className="hz">{info.semantic}</span>, sound from <span className="hz">{info.phonetic}</span>
                  {primaryEntry(info.phonetic) && <> ({toMarked(primaryEntry(info.phonetic)!.p)})</>}
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function Examples({ word }: { word: string }) {
  const [ruby, setRuby] = useState(true);
  const list = useMemo(() => {
    const simp = toSimplified(word);
    const authored = packSentences().filter((s) => s.zh.includes(simp));
    const seen = new Set(authored.map((s) => s.zh));
    return [...authored, ...examples(word, 6).filter((s) => !seen.has(s.zh))].slice(0, 6);
  }, [word]);
  if (!list.length) return null;
  return (
    <section className="section">
      <h3 className="section-title">
        Examples
        <button onClick={() => setRuby((r) => !r)}>{ruby ? 'Hide pinyin' : 'Show pinyin'}</button>
      </h3>
      <div className="stack-sm">
        {list.map((s) => (
          <div key={s.zh} className="example">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <TapText text={s.zh} ruby={ruby} className="example-zh" />
                <p className="small muted">{s.en}</p>
              </div>
              <AudioButton text={s.zh} size="sm" />
            </div>
          </div>
        ))}
      </div>
      <p className="tiny faint" style={{ marginTop: 6 }}>
        Tap any word to look it up and add it.
      </p>
    </section>
  );
}

function Family({ chars, word }: { chars: string[]; word: string }) {
  const unique = [...new Set(chars)];
  const families = unique.map((c) => ({ c, words: compounds(c, 18).filter((e) => e.s !== word) }));
  if (!families.some((f) => f.words.length)) return null;
  return (
    <section className="section">
      <h3 className="section-title">Character family</h3>
      <div className="stack">
        {families.map(({ c, words }) =>
          words.length ? (
            <div key={c}>
              <p className="small muted" style={{ marginBottom: 6 }}>
                Words with <Hz s={c} className="bold" />
              </p>
              <div className="chips wrap">
                {words.map((e) => (
                  <a key={e.id} className="chip family-chip" href={wordHref(e.s, e.p)}>
                    <Hz s={e.s} t={e.t} className="bold" />
                    <span className="tiny faint">{shortDefinition(e, 1).slice(0, 22)}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}

function OtherReadings({ entry }: { entry: DictEntry }) {
  const others = lookup(entry.s).filter((e) => e.id !== entry.id);
  if (!others.length) return null;
  return (
    <section className="section">
      <h3 className="section-title">Other readings</h3>
      <div className="list">
        {others.slice(0, 6).map((e) => (
          <a key={e.id} className="list-item" href={wordHref(e.s, e.p)}>
            <Pinyin p={e.p} force className="bold" />
            <span className="grow small muted">{shortDefinition(e, 2)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
