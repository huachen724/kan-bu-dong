import { useLiveQuery } from 'dexie-react-hooks';
import type { FlashCard } from './types';
import type { QuizMode } from './lib/db';
import { addCards, createDeck, flashcardToNewCard } from './lib/cards';
import { dueCounts } from './lib/srs';
import { goBack, navigate, useRoute } from './lib/router';
import { dismiss, useToasts } from './lib/toast';
import { useSettings } from './lib/settings';
import { IconBook, IconCards, IconHome, IconPen, IconSearch } from './components/Icons';
import { SetsView } from './components/SetsView';
import { UploadView } from './components/UploadView';
import { SetDetailView } from './components/SetDetailView';
import { EditView } from './components/EditView';
import { HomeView } from './views/HomeView';
import { DictionaryView } from './views/DictionaryView';
import { WordView } from './views/WordView';
import { ReviewView } from './views/ReviewView';
import { CramView } from './views/CramView';
import { WritePracticeView, WriteView } from './views/WriteView';
import { ReadView, ReaderView } from './views/ReadView';
import { PackView, PacksView } from './views/PacksView';
import { RadicalsView } from './views/RadicalsView';
import { FamilyTalkView } from './views/FamilyTalkView';
import { SpeakView } from './views/SpeakView';
import { SettingsView } from './views/SettingsView';
import type { PadMode } from './components/WritingPad';
import './App.css';

type Tab = 'home' | 'dict' | 'cards' | 'write' | 'read';

const TABS: { id: Tab; label: string; href: string; Icon: typeof IconHome }[] = [
  { id: 'home', label: 'Home', href: '#/', Icon: IconHome },
  { id: 'dict', label: 'Dictionary', href: '#/dict', Icon: IconSearch },
  { id: 'cards', label: 'Flashcards', href: '#/cards', Icon: IconCards },
  { id: 'write', label: 'Write', href: '#/write', Icon: IconPen },
  { id: 'read', label: 'Read', href: '#/read', Icon: IconBook },
];

async function handleCreate(name: string, cards: FlashCard[]) {
  const deck = await createDeck(name, { kind: 'custom' });
  await addCards(
    cards.map((c) => flashcardToNewCard(c, 'import')),
    deck.id,
  );
  navigate(`deck/${deck.id}`, { replace: true });
}

function useScreen(): { tab: Tab; fullscreen?: boolean; el: React.ReactNode } {
  const { path, query, raw } = useRoute();
  const [a = '', b, c] = path;
  switch (a) {
    case '':
      return { tab: 'home', el: <HomeView /> };
    case 'dict':
      return { tab: 'dict', el: <DictionaryView /> };
    case 'word':
      return { tab: 'dict', el: <WordView key={raw} word={b ?? ''} pinyin={query.get('p') ?? undefined} /> };
    case 'speak':
      return { tab: 'dict', el: <SpeakView /> };
    case 'cards':
      if (b === 'new') return { tab: 'cards', el: <UploadView onSave={(n, cs) => void handleCreate(n, cs)} onBack={() => goBack('cards')} /> };
      return { tab: 'cards', el: <SetsView /> };
    case 'deck':
      if (c === 'edit') return { tab: 'cards', el: <EditView deckId={b!} onDone={() => goBack(`deck/${b}`)} /> };
      return { tab: 'cards', el: <SetDetailView key={b} deckId={b!} /> };
    case 'cram':
      return { tab: 'cards', fullscreen: true, el: <CramView deckId={b!} /> };
    case 'review':
      return {
        tab: 'cards',
        fullscreen: true,
        el: (
          <ReviewView
            key={raw}
            deckId={query.get('deck') ?? undefined}
            mode={(query.get('mode') as QuizMode | null) ?? undefined}
            extraNew={query.get('new') ? Number(query.get('new')) : undefined}
          />
        ),
      };
    case 'write':
      if (b) return { tab: 'write', el: <WritePracticeView key={raw} word={b} initialMode={(query.get('mode') as PadMode | null) ?? undefined} /> };
      return { tab: 'write', el: <WriteView /> };
    case 'read':
      if (b) return { tab: 'read', el: <ReaderView key={b} id={b} /> };
      return { tab: 'read', el: <ReadView /> };
    case 'packs':
      return { tab: 'home', el: <PacksView /> };
    case 'pack':
      return { tab: 'home', el: <PackView key={b} id={b!} /> };
    case 'radicals':
      return { tab: 'home', el: <RadicalsView /> };
    case 'family':
      return { tab: 'home', el: <FamilyTalkView /> };
    case 'settings':
      return { tab: 'home', el: <SettingsView /> };
    default:
      return { tab: 'home', el: <HomeView /> };
  }
}

export default function App() {
  const screen = useScreen();
  useSettings();
  const counts = useLiveQuery(() => dueCounts(), []);
  const toasts = useToasts();
  const badge = counts ? counts.due + counts.fresh : 0;

  return (
    <div className={`app ${screen.fullscreen ? 'fullscreen' : ''}`}>
      <main className="app-main">{screen.el}</main>

      {!screen.fullscreen && (
        <nav className="bottom-nav" aria-label="Main">
          <div className="bottom-nav-inner">
            {TABS.map(({ id, label, href, Icon }) => (
              <a key={id} href={href} className={`nav-tab ${screen.tab === id ? 'active' : ''}`} aria-current={screen.tab === id ? 'page' : undefined}>
                <Icon />
                <span>{label}</span>
                {id === 'cards' && badge > 0 && <span className="nav-badge">{badge > 99 ? '99+' : badge}</span>}
              </a>
            ))}
          </div>
        </nav>
      )}

      <div className="toasts" aria-live="polite" style={screen.fullscreen ? { bottom: 'calc(96px + env(safe-area-inset-bottom))' } : undefined}>
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
