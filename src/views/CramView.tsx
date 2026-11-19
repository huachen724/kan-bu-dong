import { useEffect, useState } from 'react';
import type { CardOutcome, FlashCard } from '../types';
import { db } from '../lib/db';
import { toFlashCard } from '../lib/cards';
import { goBack } from '../lib/router';
import { useSettings } from '../lib/settings';
import { DeckView } from '../components/DeckView';
import { ResultsView } from '../components/ResultsView';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

type Stage =
  | { mode: 'deck'; cards: FlashCard[]; originalCards: FlashCard[] }
  | { mode: 'results'; cards: FlashCard[]; originalCards: FlashCard[]; outcomes: CardOutcome[] };

/**
 * The original "go through the whole set" study flow (Got it / Again → results → redo missed),
 * kept as-is for quick cramming without touching the SRS schedule.
 */
export function CramView({ deckId }: { deckId: string }) {
  const { script } = useSettings();
  const [stage, setStage] = useState<Stage | null>(null);

  useEffect(() => {
    void db.cards
      .where('deckId')
      .equals(deckId)
      .toArray()
      .then((rows) => {
        const cards = rows.filter((c) => !c.deleted).map((c) => toFlashCard(c, script));
        setStage({ mode: 'deck', cards: shuffle(cards), originalCards: cards });
      });
  }, [deckId, script]);

  if (!stage) return null;

  if (stage.mode === 'deck') {
    return (
      <div className="app">
        <DeckView
          key={stage.cards.map((c) => c.id).join()}
          cards={stage.cards}
          onDone={(outcomes) => setStage({ ...stage, mode: 'results', outcomes })}
          onShuffle={() => setStage({ ...stage, cards: shuffle(stage.originalCards) })}
          onHome={() => goBack(`deck/${deckId}`)}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <ResultsView
        cards={stage.cards}
        outcomes={stage.outcomes}
        onRedoMissed={(missed) => setStage({ mode: 'deck', cards: shuffle(missed), originalCards: missed })}
        onBack={() => goBack(`deck/${deckId}`)}
      />
    </div>
  );
}
