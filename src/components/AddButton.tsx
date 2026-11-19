import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addCard, moveCard, type NewCard } from '../lib/cards';
import { db } from '../lib/db';
import { useSettings, updateSettings } from '../lib/settings';
import { toast } from '../lib/toast';
import { IconCheck, IconPlus } from './Icons';
import { Sheet } from './Sheet';

/**
 * Pleco-style one-tap "Add to Flashcards". Adds to the last-used deck immediately;
 * the toast offers "Change" to move it to another deck (long-press also opens the picker).
 */
export function AddButton({ card, compact = false }: { card: NewCard; compact?: boolean }) {
  const { lastDeckId } = useSettings();
  const inDeck = useLiveQuery(
    () => db.cards.where('hanzi').equals(card.hanzi).filter((c) => !c.deleted).count(),
    [card.hanzi],
  );
  const [picking, setPicking] = useState(false);
  const justCreated = useRef<string | null>(null);
  const added = (inDeck ?? 0) > 0;

  async function add(deckId = lastDeckId) {
    const { created, deck, card: saved } = await addCard(card, deckId);
    justCreated.current = created ? saved.id : null;
    if (created) toast(`Added ${card.hanzi} to ${deck.name}`, { label: 'Change', run: () => setPicking(true) });
    else toast(`${card.hanzi} is already in ${deck.name}`, { label: 'Other deck', run: () => setPicking(true) });
  }

  return (
    <>
      <button
        type="button"
        className={`btn ${compact ? 'btn-sm' : ''} ${added ? 'btn-secondary' : 'btn-primary'}`}
        onClick={(e) => {
          e.stopPropagation();
          void add();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          justCreated.current = null;
          setPicking(true);
        }}
        aria-label={added ? `${card.hanzi} is in your flashcards` : `Add ${card.hanzi} to flashcards`}
      >
        {added ? <IconCheck /> : <IconPlus />}
        {compact ? (added ? 'Added' : 'Add') : added ? 'In flashcards' : 'Add to Flashcards'}
      </button>
      {picking && (
        <DeckPicker
          onClose={() => setPicking(false)}
          onPick={async (id) => {
            setPicking(false);
            updateSettings({ lastDeckId: id });
            if (justCreated.current) {
              await moveCard(justCreated.current, id);
              justCreated.current = null;
              const deck = await db.decks.get(id);
              toast(`Moved ${card.hanzi} to ${deck?.name ?? 'deck'}`);
            } else await add(id);
          }}
        />
      )}
    </>
  );
}

export function DeckPicker({ onPick, onClose }: { onPick: (deckId: string) => void; onClose: () => void }) {
  const decks = useLiveQuery(() => db.decks.toArray(), []);
  return (
    <Sheet onClose={onClose} label="Choose deck">
      <h2 className="bold" style={{ marginBottom: 12 }}>
        Add to which deck?
      </h2>
      <div className="list">
        {(decks ?? [])
          .filter((d) => !d.deleted)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((d) => (
            <button key={d.id} className="list-item" onClick={() => onPick(d.id)}>
              <span className="grow bold">{d.name}</span>
              <span className="chev">›</span>
            </button>
          ))}
      </div>
    </Sheet>
  );
}
