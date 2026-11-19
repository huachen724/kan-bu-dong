import { useEffect, useState } from 'react';
import { db, type Card } from '../lib/db';
import { addCards, completeCard, deleteCard, updateCard, updateDeck } from '../lib/cards';
import { toMarked } from '../lib/pinyin';
import './EditView.css';

interface Row {
  id?: string;
  hanzi: string;
  pinyin: string;
  definition: string;
}

interface Props {
  deckId: string;
  onDone: () => void;
}

/**
 * Deck editor. Same layout as the original question/answer editor, now with explicit
 * characters / pinyin / meaning fields per card (blank pinyin/meaning are filled from the dictionary).
 */
export function EditView({ deckId, onDone }: Props) {
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [original, setOriginal] = useState<Card[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const deck = await db.decks.get(deckId);
      const cards = (await db.cards.where('deckId').equals(deckId).toArray()).filter((c) => !c.deleted).sort((a, b) => a.createdAt - b.createdAt);
      setName(deck?.name ?? '');
      setOriginal(cards);
      setRows(cards.map((c) => ({ id: c.id, hanzi: c.hanzi, pinyin: c.pinyin, definition: c.definition })));
    })();
  }, [deckId]);

  if (!rows) return null;

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev!.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setError('');
    const clean = rows!.map((r) => ({ ...r, hanzi: r.hanzi.trim(), pinyin: r.pinyin.trim(), definition: r.definition.trim() }));
    if (clean.some((r) => !r.hanzi)) {
      setError('Every card needs characters. Fill in or remove the empty rows.');
      return;
    }
    await updateDeck(deckId, { name: name.trim() || 'Untitled deck' });
    const kept = new Set(clean.filter((r) => r.id).map((r) => r.id));
    for (const c of original) if (!kept.has(c.id)) await deleteCard(c.id);
    for (const r of clean.filter((x) => x.id)) {
      const before = original.find((c) => c.id === r.id)!;
      if (before.hanzi !== r.hanzi || before.pinyin !== r.pinyin || before.definition !== r.definition) {
        const full = completeCard({ hanzi: r.hanzi, pinyin: r.pinyin, definition: r.definition, source: before.source });
        await updateCard(r.id!, {
          hanzi: r.hanzi,
          trad: before.hanzi === r.hanzi ? before.trad : full.trad ?? r.hanzi,
          pinyin: r.pinyin ? toMarked(r.pinyin) : full.pinyin,
          definition: r.definition || full.definition,
        });
      }
    }
    const added = clean.filter((r) => !r.id);
    if (added.length) await addCards(added.map((r) => ({ ...r, source: 'import' })), deckId);
    onDone();
  }

  return (
    <div className="ev">
      <div className="ev-header">
        <button className="ev-back" onClick={onDone} aria-label="Back">
          ‹ Back
        </button>
        <button className="ev-save-top" onClick={() => void handleSave()}>
          Save
        </button>
      </div>

      <div className="ev-body">
        <div className="ev-name-row">
          <label className="ev-label" htmlFor="ev-name">
            Deck name
          </label>
          <input id="ev-name" className="ev-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Deck name" />
        </div>

        <section className="ev-section">
          <div className="ev-section-header">
            <span className="ev-section-title">Cards</span>
            <span className="ev-section-hint">Characters · pinyin · meaning (blank = from dictionary)</span>
          </div>
          <div className="ev-rows">
            {rows.map((r, i) => (
              <div className="ev-card-row" key={r.id ?? `new-${i}`}>
                <span className="ev-num">{i + 1}</span>
                <div className="ev-card-fields">
                  <input className="ev-input ev-input-hanzi" value={r.hanzi} onChange={(e) => update(i, { hanzi: e.target.value })} placeholder="汉字" />
                  <input className="ev-input" value={r.pinyin} onChange={(e) => update(i, { pinyin: e.target.value })} placeholder="pinyin (nǐ hǎo or ni3 hao3)" />
                  <input className="ev-input" value={r.definition} onChange={(e) => update(i, { definition: e.target.value })} placeholder="meaning" />
                </div>
                <button className="ev-remove" onClick={() => setRows((prev) => prev!.filter((_, k) => k !== i))} aria-label={`Remove card ${i + 1}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button className="ev-add" onClick={() => setRows((prev) => [...prev!, { hanzi: '', pinyin: '', definition: '' }])}>
            + Add card
          </button>
        </section>

        {error && <p className="ev-error">{error}</p>}

        <button className="ev-save-bottom" onClick={() => void handleSave()}>
          Save changes
        </button>
      </div>
    </div>
  );
}
