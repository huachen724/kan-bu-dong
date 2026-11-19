import { useDictStatus, primaryEntry } from '../lib/dictionary';
import { wordHref } from '../lib/router';
import { AddButton } from './AddButton';
import { EntryCard } from './EntryCard';
import { Sheet } from './Sheet';

/** Dictionary popup used inside readings, sentences and Speak — look up without leaving the page. */
export function EntrySheet({ word, pinyin, onClose }: { word: string; pinyin?: string; onClose: () => void }) {
  useDictStatus();
  const entry = primaryEntry(word, pinyin);
  return (
    <Sheet onClose={onClose} label={`Dictionary: ${word}`}>
      {entry ? (
        <>
          <EntryCard entry={entry} compact />
          <a className="btn btn-secondary btn-block" style={{ marginTop: 12 }} href={wordHref(entry.s, entry.p)} onClick={onClose}>
            Full entry, stroke order &amp; examples →
          </a>
        </>
      ) : (
        <div className="empty">
          <div className="big hz">{word}</div>
          <p>Not in the dictionary yet.</p>
          <div style={{ marginTop: 12 }}>
            <AddButton card={{ hanzi: word, pinyin: '', definition: '', source: 'reading' }} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
