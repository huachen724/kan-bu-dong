import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { dueCounts } from '../lib/srs';
import { addHskDeck } from '../lib/cards';
import { useDictStatus } from '../lib/dictionary';
import { navigate } from '../lib/router';
import { toast } from '../lib/toast';
import { PACKS } from '../data/packs';
import { PromptModal } from './PromptModal';
import './SetsView.css';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Deck library (originally the "study sets" list) — now with SRS due counts and starter decks. */
export function SetsView() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const status = useDictStatus();
  const decks = useLiveQuery(async () => (await db.decks.toArray()).filter((d) => !d.deleted), []);
  const counts = useLiveQuery(() => dueCounts(), []);
  const deckIds = new Set((decks ?? []).map((d) => d.id));
  const totalDue = counts ? counts.due + counts.fresh : 0;

  async function addHsk(level: number) {
    setBusy(level);
    try {
      const deck = await addHskDeck(level);
      toast(`Added HSK ${level} deck`);
      navigate(`deck/${deck.id}`);
    } finally {
      setBusy(null);
    }
  }

  const sorted = [...(decks ?? [])].sort((a, b) => {
    if (a.kind === 'default') return -1;
    if (b.kind === 'default') return 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <div className="sv">
      <div className="sv-header">
        <div>
          <span className="sv-title">汉字卡片</span>
          <p className="sv-sub">Flashcards · spaced repetition</p>
        </div>
        <button className="sv-prompt-btn" onClick={() => setShowPrompt(true)} title="AI prompt for generating sets">
          AI Prompt
        </button>
      </div>

      <div className="sv-body">
        <button className="sv-review" onClick={() => navigate('review')} disabled={!totalDue}>
          <div>
            <div className="sv-review-title">{totalDue ? 'Review now' : 'All caught up'}</div>
            <div className="sv-review-sub">
              {counts ? `${counts.due} due · ${counts.fresh} new today` : '…'}
            </div>
          </div>
          <span className="sv-review-arrow">→</span>
        </button>

        <h2 className="section-title" style={{ marginTop: 22 }}>
          My decks
        </h2>
        {sorted.length === 0 ? (
          <div className="sv-empty">
            <span className="sv-empty-icon">📚</span>
            <p className="sv-empty-title">No decks yet</p>
            <p className="sv-empty-hint">Add a starter deck below, or tap + New deck.</p>
          </div>
        ) : (
          <ul className="sv-list">
            {sorted.map((deck) => {
              const c = counts?.byDeck.get(deck.id);
              return (
                <li key={deck.id}>
                  <button className="sv-item" onClick={() => navigate(`deck/${deck.id}`)}>
                    <div className="sv-item-main">
                      <span className="sv-item-name">{deck.name}</span>
                      <span className="sv-item-meta">
                        {c?.total ?? 0} cards · {deck.kind === 'default' ? 'from dictionary' : formatDate(deck.createdAt)}
                      </span>
                    </div>
                    {c && c.due > 0 && <span className="sv-due">{c.due}</span>}
                    <span className="sv-item-arrow">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <h2 className="section-title" style={{ marginTop: 22 }}>
          Starter decks
        </h2>
        <div className="sv-starters">
          {[1, 2, 3, 4, 5, 6].map((lv) => {
            const have = deckIds.has(`hsk-${lv}`);
            const available = lv === 1 || status.level === 'full';
            return (
              <button
                key={lv}
                className={`sv-starter ${have ? 'have' : ''}`}
                disabled={!available || busy !== null}
                onClick={() => (have ? navigate(`deck/hsk-${lv}`) : void addHsk(lv))}
                title={available ? '' : 'Needs the full dictionary (downloading)'}
              >
                <span className="sv-starter-name">HSK {lv}</span>
                <span className="sv-starter-sub">{busy === lv ? 'Adding…' : have ? 'Open' : available ? '+ Add' : 'Loading…'}</span>
              </button>
            );
          })}
        </div>
        <div className="sv-starters" style={{ marginTop: 10 }}>
          {PACKS.map((p) => (
            <button key={p.id} className={`sv-starter ${deckIds.has(`pack-${p.id}`) ? 'have' : ''}`} onClick={() => navigate(`pack/${p.id}`)}>
              <span className="sv-starter-name">
                {p.icon} {p.zh}
              </span>
              <span className="sv-starter-sub">{p.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sv-footer">
        <button className="sv-new-btn" onClick={() => navigate('cards/new')}>
          + New deck
        </button>
      </div>

      {showPrompt && <PromptModal onClose={() => setShowPrompt(false)} />}
    </div>
  );
}
