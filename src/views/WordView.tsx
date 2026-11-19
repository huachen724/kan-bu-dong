import { useEffect } from 'react';
import { primaryEntry, useDictStatus } from '../lib/dictionary';
import { goBack } from '../lib/router';
import { EntryCard } from '../components/EntryCard';
import { IconBack } from '../components/Icons';
import { AddButton } from '../components/AddButton';
import { pushRecent } from './DictionaryView';

export function WordView({ word, pinyin }: { word: string; pinyin?: string }) {
  const status = useDictStatus();
  const entry = primaryEntry(word, pinyin);
  useEffect(() => {
    if (entry) pushRecent(entry.s);
  }, [entry]);

  return (
    <div className="page">
      <div className="topbar">
        <button className="icon-btn" onClick={() => goBack('dict')} aria-label="Back">
          <IconBack />
        </button>
        <h1>Dictionary</h1>
      </div>
      {entry ? (
        <EntryCard key={entry.id} entry={entry} />
      ) : (
        <div className="empty">
          <div className="big hz">{word}</div>
          <p>{status.loading ? 'Loading the full dictionary…' : 'This word is not in the dictionary.'}</p>
          <div style={{ marginTop: 12 }}>
            <AddButton card={{ hanzi: word, pinyin: '', definition: '', source: 'dictionary' }} />
          </div>
        </div>
      )}
    </div>
  );
}
