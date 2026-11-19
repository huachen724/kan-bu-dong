import { useEffect, useMemo, useRef, useState } from 'react';
import { search, shortDefinition, useDictStatus, ensureFull, type DictEntry } from '../lib/dictionary';
import { entryToCard } from '../lib/cards';
import { navigate, useRoute, wordHref } from '../lib/router';
import { AddButton } from '../components/AddButton';
import { Hz, Pinyin } from '../components/Hanzi';
import { HskBadges } from '../components/EntryCard';
import { IconClose, IconMic, IconSearch } from '../components/Icons';
import './DictionaryView.css';

const RECENT_KEY = 'hz_recent_v1';
function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
export function pushRecent(word: string) {
  try {
    const list = [word, ...loadRecent().filter((w) => w !== word)].slice(0, 16);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

const EXAMPLES = ['ni hao', 'nǐ hǎo', 'ma1 ma5', 'family', 'xiao xin', '电', '心情', 'happy', 'zh/z fuzzy: zong wen'];

export function DictionaryView() {
  const route = useRoute();
  const status = useDictStatus();
  const [q, setQ] = useState(route.query.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      navigate(q ? `dict?q=${encodeURIComponent(q)}` : 'dict', { replace: true });
    }, 140);
    return () => clearTimeout(t);
  }, [q]);

  // status.entries in deps: results refresh when the full dictionary finishes loading
  const result = useMemo(() => search(debounced), [debounced, status.entries]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page dict">
      <div className="dict-bar">
        <div className="dict-input-wrap">
          <IconSearch className="dict-input-icon" />
          <input
            ref={inputRef}
            className="dict-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="汉字, pinyin (ni hao / nǐ hǎo / ni3 hao3) or English"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-label="Search the dictionary"
          />
          {q && (
            <button className="icon-btn dict-clear" onClick={() => (setQ(''), inputRef.current?.focus())} aria-label="Clear search">
              <IconClose />
            </button>
          )}
        </div>
        <a className="icon-btn dict-mic" href="#/speak" aria-label="Speak a phrase">
          <IconMic />
        </a>
      </div>

      {status.level !== 'full' && (
        <div className="banner" style={{ marginBottom: 12 }}>
          {status.loading ? (
            <span className="grow">Downloading full dictionary for offline use… {Math.round(status.progress * 100)}%</span>
          ) : (
            <>
              <span className="grow">
                Starter dictionary ({status.entries.toLocaleString()} words).{' '}
                {status.error ? `Full dictionary unavailable: ${status.error}` : ''}
              </span>
              <button className="btn btn-sm btn-secondary" onClick={() => void ensureFull(true)}>
                Retry
              </button>
            </>
          )}
        </div>
      )}

      {!debounced ? (
        <EmptyState onPick={setQ} />
      ) : (
        <>
          {result.breakdown.length > 0 && (
            <section style={{ marginBottom: 16 }}>
              <h2 className="section-title">Word by word</h2>
              <div className="chips wrap">
                {result.breakdown.map((t, i) => (
                  <a key={i} className="chip dict-break" href={wordHref(t.text, t.entry?.p)}>
                    <Hz s={t.text} t={t.entry?.t} className="bold" />
                    {t.entry && <Pinyin p={t.entry.p} className="tiny" />}
                  </a>
                ))}
              </div>
            </section>
          )}
          {result.entries.length === 0 && result.breakdown.length > 0 ? null : result.entries.length === 0 ? (
            <div className="empty">
              <div className="big">🔍</div>
              <p>No matches for “{debounced}”.</p>
              {status.level !== 'full' && <p className="small faint">The full dictionary isn't loaded yet.</p>}
            </div>
          ) : (
            <div className="list">
              {result.entries.map((e) => (
                <ResultRow key={e.id} e={e} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResultRow({ e }: { e: DictEntry }) {
  return (
    <div className="list-item dict-row">
      <a className="dict-row-main" href={wordHref(e.s, e.p)}>
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
          <Hz s={e.s} t={e.t} className="dict-row-hz" />
          <Pinyin p={e.p} force className="small" />
        </div>
        <div className="row" style={{ gap: 6, marginTop: 2 }}>
          <HskBadges e={e} />
          <span className="small muted dict-row-def">{shortDefinition(e, 3)}</span>
        </div>
      </a>
      <AddButton card={entryToCard(e)} compact />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const recent = loadRecent();
  const status = useDictStatus();
  return (
    <div className="stack">
      {recent.length > 0 && (
        <section>
          <h2 className="section-title">Recent</h2>
          <div className="chips wrap">
            {recent.map((w) => (
              <a key={w} className="chip hz" href={wordHref(w)}>
                <Hz s={w} />
              </a>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="section-title">Try searching</h2>
        <div className="chips wrap">
          {EXAMPLES.map((x) => (
            <button key={x} className="chip" onClick={() => onPick(x.replace(/^.*: /, ''))}>
              {x}
            </button>
          ))}
        </div>
      </section>
      <section className="surface small muted stack-sm">
        <p>
          <strong>Search any way you know a word:</strong> characters, pinyin with tone marks or numbers, toneless pinyin, or
          English. Toneless search forgives z/zh, c/ch, s/sh, n/l and -n/-ng mix-ups.
        </p>
        <p>
          Tap the 🎤 to <strong>say</strong> a word you know and see how it's written.
        </p>
        <p className="tiny faint">
          {status.entries.toLocaleString()} entries · {status.level === 'full' ? 'full CC-CEDICT, works offline' : 'starter set'} · data: CC-CEDICT, HSK lists,
          Make Me a Hanzi, Tatoeba
        </p>
      </section>
    </div>
  );
}
