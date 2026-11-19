import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ALL_MODES, db, type QuizMode } from '../lib/db';
import { deleteCard, deleteDeck, restoreCard, updateDeck } from '../lib/cards';
import { dueCounts, State } from '../lib/srs';
import { goBack, navigate, wordHref } from '../lib/router';
import { toast } from '../lib/toast';
import { Hz, Pinyin } from './Hanzi';
import { IconTrash } from './Icons';
import './SetDetailView.css';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const MODE_INFO: Record<QuizMode, { label: string; desc: string }> = {
  reading: { label: 'Reading', desc: 'See 汉字 → recall pinyin + meaning' },
  writing: { label: 'Writing', desc: 'Pinyin + meaning + audio → write it on screen' },
  listening: { label: 'Listening', desc: 'Hear it → pick the characters' },
  meaning: { label: 'Meaning', desc: 'English → recall the characters' },
};

/** Deck detail (originally the study-set detail page). */
export function SetDetailView({ deckId }: { deckId: string }) {
  const [confirming, setConfirming] = useState(false);
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId]);
  const cards = useLiveQuery(async () => (await db.cards.where('deckId').equals(deckId).toArray()).filter((c) => !c.deleted), [deckId]);
  const counts = useLiveQuery(() => dueCounts(), [deckId]);
  const srs = useLiveQuery(() => db.srs.where('deckId').equals(deckId).toArray(), [deckId]);

  if (deck === undefined || cards === undefined) return null;
  if (!deck || deck.deleted) {
    return (
      <div className="empty">
        <p>This deck no longer exists.</p>
        <a className="btn btn-secondary" href="#/cards" style={{ marginTop: 12 }}>
          Back to decks
        </a>
      </div>
    );
  }

  const c = counts?.byDeck.get(deckId);
  const learned = new Set((srs ?? []).filter((s) => s.state === State.Review && !s.deleted).map((s) => s.cardId));

  async function toggleMode(m: QuizMode) {
    if (!deck) return;
    const modes = deck.modes.includes(m) ? deck.modes.filter((x) => x !== m) : [...deck.modes, m];
    if (!modes.length) {
      toast('Keep at least one quiz mode on');
      return;
    }
    await updateDeck(deck.id, { modes: ALL_MODES.filter((x) => modes.includes(x)) });
  }

  return (
    <div className="sdv">
      <div className="sdv-header">
        <button className="sdv-back" onClick={() => goBack('cards')} aria-label="Back to library">
          ‹ Library
        </button>
      </div>

      <div className="sdv-hero">
        <h1 className="sdv-name">{deck.name}</h1>
        <p className="sdv-meta">
          {cards.length} {cards.length === 1 ? 'card' : 'cards'} · {learned.size} learned · Created {formatDate(deck.createdAt)}
        </p>
        {deck.description && <p className="small muted">{deck.description}</p>}
      </div>

      <div className="sdv-actions">
        <button className="sdv-btn sdv-study" onClick={() => navigate(`review?deck=${deck.id}`)} disabled={!cards.length}>
          Study → {c ? `${c.due} due · ${Math.min(c.fresh, counts?.fresh ?? 0)} new` : ''}
        </button>
        <div className="grid-2">
          <button className="sdv-btn sdv-edit" onClick={() => navigate(`review?deck=${deck.id}&mode=writing`)} disabled={!cards.length}>
            ✍️ Writing only
          </button>
          <button className="sdv-btn sdv-edit" onClick={() => navigate(`cram/${deck.id}`)} disabled={!cards.length}>
            ⚡ Quick run-through
          </button>
        </div>
        <button className="sdv-btn sdv-edit" onClick={() => navigate(`deck/${deck.id}/edit`)}>
          Edit cards
        </button>
      </div>

      <section className="section" style={{ padding: '0 20px' }}>
        <h2 className="section-title">Quiz modes</h2>
        <div className="list">
          {ALL_MODES.map((m) => (
            <label key={m} className="list-item" style={{ cursor: 'pointer' }}>
              <div className="grow">
                <div className="bold">{MODE_INFO[m].label}</div>
                <div className="small muted">{MODE_INFO[m].desc}</div>
              </div>
              <span className="switch">
                <input type="checkbox" checked={deck.modes.includes(m)} onChange={() => void toggleMode(m)} />
                <span />
              </span>
            </label>
          ))}
        </div>
        <p className="tiny faint" style={{ marginTop: 6 }}>
          Each mode has its own spaced-repetition schedule, so you can know a word by sight long before you can write it.
        </p>
      </section>

      <section className="section" style={{ padding: '0 20px' }}>
        <h2 className="section-title">Cards</h2>
        {cards.length === 0 ? (
          <p className="muted small">No cards yet — add words from the Dictionary with one tap.</p>
        ) : (
          <div className="list">
            {[...cards]
              .sort((a, b) => a.createdAt - b.createdAt)
              .map((card) => (
                <div key={card.id} className="list-item">
                  <a href={wordHref(card.hanzi)} className="grow" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                      <Hz s={card.hanzi} t={card.trad} className="sdv-card-hz" />
                      <Pinyin p={card.pinyin} className="small" />
                      {learned.has(card.id) && <span className="badge badge-green">learned</span>}
                    </div>
                    <div className="small muted sdv-card-def">{card.definition}</div>
                  </a>
                  <button
                    className="icon-btn"
                    aria-label={`Delete ${card.hanzi}`}
                    onClick={async () => {
                      await deleteCard(card.id);
                      toast(`Removed ${card.hanzi}`, {
                        label: 'Undo',
                        run: () => void restoreCard(card.id),
                      });
                    }}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
          </div>
        )}
      </section>

      {deck.kind !== 'default' && (
        <div className="sdv-danger-zone">
          {confirming ? (
            <div className="sdv-confirm">
              <p className="sdv-confirm-msg">Delete "{deck.name}" and its review history? This cannot be undone.</p>
              <div className="sdv-confirm-btns">
                <button className="sdv-confirm-cancel" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  className="sdv-confirm-delete"
                  onClick={async () => {
                    await deleteDeck(deck.id);
                    navigate('cards', { replace: true });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button className="sdv-delete-link" onClick={() => setConfirming(true)}>
              Delete this deck
            </button>
          )}
        </div>
      )}
    </div>
  );
}
